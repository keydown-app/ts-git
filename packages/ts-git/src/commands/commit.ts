import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import {
  normalizeTimestamp,
  normalizeTimezoneOffset,
  Author,
} from '../types.js';
import {
  writeObject,
  serializeCommit,
  readObject,
  deserializeCommit,
} from '../core/objects.js';
import { readIndex, IndexEntry } from '../core/index.js';
import {
  resolveHead,
  writeRef,
  getCurrentBranch,
  readRef,
  setHeadDetached,
} from '../core/refs.js';
import { EmptyCommitError, NotAGitRepoError } from '../errors.js';

export async function commit(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  message: string;
  author: Author;
  committer?: Author;
  ref?: string;
  parent?: string[];
  dryRun?: boolean;
  noUpdateBranch?: boolean;
}): Promise<string> {
  const {
    fs,
    dir: _dir,
    gitdir: providedGitdir,
    message,
    author,
    committer,
    ref,
    parent: explicitParent,
    dryRun = false,
    noUpdateBranch = false,
  } = args;

  const gitdir = providedGitdir ?? joinPaths(_dir, '.git');

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      _dir,
    );
  }

  const index = await readIndex(fs, gitdir);

  // Build tree from index
  const treeOid = await writeTreeFromIndex(fs, gitdir, index.entries);

  // Determine parents
  let parent: string[] = explicitParent ?? [];
  let headInfo = await resolveHead(fs, gitdir);

  if (parent.length === 0 && headInfo) {
    if (headInfo.type === 'commit') {
      parent = [headInfo.oid];
    } else if (headInfo.type === 'symbolic') {
      const oid = await readRef(fs, gitdir, headInfo.ref);
      if (oid) {
        parent = [oid];
      }
    }
  }

  // C2: Detect true empty commits
  // If there's exactly one parent and the tree is the same, it's an empty commit
  if (parent.length === 1 && !explicitParent) {
    try {
      const { content } = await readObject(fs, gitdir, parent[0]);
      const parentCommit = deserializeCommit(content);
      if (parentCommit.tree === treeOid) {
        throw new EmptyCommitError('nothing to commit, working tree clean');
      }
    } catch (error) {
      // If we can't read the parent, continue (might be first commit)
      if (error instanceof EmptyCommitError) {
        throw error;
      }
    }
  }

  // If no parent and empty tree (initial commit with nothing), reject
  if (parent.length === 0 && index.entries.length === 0) {
    throw new EmptyCommitError('nothing to commit');
  }

  const authorTimestamp = normalizeTimestamp(author.timestamp);
  const authorTimezone = normalizeTimezoneOffset(author.timezoneOffset);

  const committerData = committer ?? author;
  const committerTimestamp = normalizeTimestamp(committerData.timestamp);
  const committerTimezone = normalizeTimezoneOffset(
    committerData.timezoneOffset,
  );

  const commitObj = {
    tree: treeOid,
    parent,
    author: {
      name: author.name,
      email: author.email,
      timestamp: authorTimestamp,
      timezoneOffset: authorTimezone,
    },
    committer: {
      name: committerData.name,
      email: committerData.email,
      timestamp: committerTimestamp,
      timezoneOffset: committerTimezone,
    },
    message,
  };

  const commitContent = serializeCommit(commitObj);
  const commitOid = await writeObject(fs, gitdir, 'commit', commitContent);

  if (dryRun) {
    return commitOid;
  }

  // C3 & C4: Handle detached HEAD and ref correctly
  if (!noUpdateBranch) {
    if (ref) {
      // C4: If ref already starts with refs/, use it directly
      const refPath = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
      await writeRef(fs, gitdir, refPath, commitOid, true);
    } else if (headInfo?.type === 'commit') {
      // C3: Detached HEAD - update HEAD directly
      await setHeadDetached(fs, gitdir, commitOid);
    } else if (headInfo?.type === 'symbolic') {
      // Normal branch - update the branch ref
      const branchName = await getCurrentBranch(fs, gitdir);
      if (branchName) {
        await writeRef(fs, gitdir, `refs/heads/${branchName}`, commitOid, true);
      }
    } else {
      // No HEAD yet (initial commit) - create master branch
      await writeRef(fs, gitdir, 'refs/heads/master', commitOid, true);
      // And point HEAD to it
      const { setHead } = await import('../core/refs.js');
      await setHead(fs, gitdir, 'refs/heads/master');
    }
  }

  return commitOid;
}

async function writeTreeFromIndex(
  fs: FSAdapter,
  gitdir: string,
  entries: IndexEntry[],
): Promise<string> {
  if (entries.length === 0) {
    const emptyTree = await writeObject(fs, gitdir, 'tree', new Uint8Array(0));
    return emptyTree;
  }

  const treeEntries = entries.map((entry) => ({
    mode: modeToString(entry.mode),
    path: entry.path,
    oid: entry.oid,
  }));

  return writeTreeFromEntries(fs, gitdir, treeEntries);
}

async function writeTreeFromEntries(
  fs: FSAdapter,
  gitdir: string,
  entries: { mode: string; path: string; oid: string }[],
): Promise<string> {
  const byDir = new Map<
    string,
    { mode: string; path: string; oid: string }[]
  >();
  const rootEntries: { mode: string; path: string; oid: string }[] = [];

  for (const entry of entries) {
    const slashIndex = entry.path.indexOf('/');
    if (slashIndex === -1) {
      rootEntries.push(entry);
    } else {
      const dir = entry.path.slice(0, slashIndex);
      const rest = entry.path.slice(slashIndex + 1);
      if (!byDir.has(dir)) {
        byDir.set(dir, []);
      }
      byDir.get(dir)!.push({ mode: entry.mode, path: rest, oid: entry.oid });
    }
  }

  const treeContentParts: Uint8Array[] = [];

  // C5: Use byte-order sorting instead of localeCompare
  for (const entry of rootEntries.sort((a, b) =>
    comparePathBytes(a.path, b.path),
  )) {
    const modeBuffer = new TextEncoder().encode(entry.mode + ' ');
    const pathBuffer = new TextEncoder().encode(entry.path);
    const oidBuffer = hexToBuffer(entry.oid);
    const nullByte = new Uint8Array([0]);
    treeContentParts.push(modeBuffer, pathBuffer, nullByte, oidBuffer);
  }

  for (const [dir, subEntries] of byDir) {
    const subTreeOid = await writeTreeFromEntries(fs, gitdir, subEntries);
    const modeBuffer = new TextEncoder().encode('040000 ');
    const pathBuffer = new TextEncoder().encode(dir);
    const oidBuffer = hexToBuffer(subTreeOid);
    const nullByte = new Uint8Array([0]);
    treeContentParts.push(modeBuffer, pathBuffer, nullByte, oidBuffer);
  }

  const treeContent = concatBuffers(...treeContentParts);
  const treeOid = await writeObject(fs, gitdir, 'tree', treeContent);

  return treeOid;
}

/**
 * C5: Git-style byte-order path comparison.
 * This is NOT locale-sensitive and compares raw byte values.
 */
function comparePathBytes(a: string, b: string): number {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  const minLen = Math.min(aBytes.length, bBytes.length);

  for (let i = 0; i < minLen; i++) {
    if (aBytes[i] !== bBytes[i]) {
      return aBytes[i] - bBytes[i];
    }
  }

  return aBytes.length - bBytes.length;
}

function hexToBuffer(hex: string): Uint8Array {
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return array;
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function modeToString(mode: number): string {
  if ((mode & 0o170000) === 0o120000) return '120000';
  if ((mode & 0o170000) === 0o160000) return '160000';
  if ((mode & 0o170000) === 0o040000) return '040000';
  if ((mode & 0o100) !== 0) return '100755';
  return '100644';
}
