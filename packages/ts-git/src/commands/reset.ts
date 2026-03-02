import { FSAdapter } from '../fs/types.js';
import { parseGitDir } from '../utils/path.js';
import {
  readIndex,
  writeIndex,
  IndexEntry,
  createFlags,
} from '../core/index.js';
import { readObject, deserializeTree, TreeEntryRaw } from '../core/objects.js';
import { resolveHead, readRef } from '../core/refs.js';
import { NotAGitRepoError } from '../errors.js';

export interface ResetResult {
  unstaged: string[];
}

/**
 * Reset index entries to match HEAD.
 *
 * This restores the index to match the state of HEAD for the specified paths:
 * - Tracked files: restored to HEAD version (undoing staged modifications)
 * - Staged additions: removed from index (they don't exist in HEAD)
 * - Staged deletions: restored from HEAD
 *
 * The working tree is NOT modified - only the index changes.
 */
export async function reset(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  filepath?: string | string[];
}): Promise<ResetResult> {
  const { fs, dir, gitdir: providedGitdir, filepath } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const index = await readIndex(fs, gitdir);
  const result: ResetResult = { unstaged: [] };

  // Get HEAD tree entries
  const headTreeMap = await getHeadTreeMap(fs, gitdir);

  if (filepath === undefined) {
    // Full reset: restore entire index to match HEAD
    const newEntries: IndexEntry[] = [];

    for (const [path, treeEntry] of headTreeMap) {
      // Try to preserve stat info from existing index entry if available
      const existingEntry = index.entries.find((e) => e.path === path);

      const entry: IndexEntry = {
        ctimeSeconds: existingEntry?.ctimeSeconds ?? 0,
        ctimeNanoseconds: existingEntry?.ctimeNanoseconds ?? 0,
        mtimeSeconds: existingEntry?.mtimeSeconds ?? 0,
        mtimeNanoseconds: existingEntry?.mtimeNanoseconds ?? 0,
        dev: existingEntry?.dev ?? 0,
        ino: existingEntry?.ino ?? 0,
        mode: parseInt(treeEntry.mode, 8),
        uid: existingEntry?.uid ?? 0,
        gid: existingEntry?.gid ?? 0,
        size: existingEntry?.size ?? 0,
        oid: treeEntry.oid,
        flags: existingEntry?.flags ?? createFlags(treeEntry.path),
        path: treeEntry.path,
      };

      newEntries.push(entry);
    }

    // Track all currently staged paths as unstaged
    result.unstaged = index.entries.map((e) => e.path);
    index.entries = newEntries;
  } else {
    // Partial reset: restore specific paths to match HEAD
    const files = Array.isArray(filepath) ? filepath : [filepath];

    for (const file of files) {
      const treeEntry = headTreeMap.get(file);
      const existingIndex = index.entries.findIndex((e) => e.path === file);

      if (treeEntry) {
        // File exists in HEAD: restore it to the index
        const existingEntry =
          existingIndex >= 0 ? index.entries[existingIndex] : undefined;

        const entry: IndexEntry = {
          ctimeSeconds: existingEntry?.ctimeSeconds ?? 0,
          ctimeNanoseconds: existingEntry?.ctimeNanoseconds ?? 0,
          mtimeSeconds: existingEntry?.mtimeSeconds ?? 0,
          mtimeNanoseconds: existingEntry?.mtimeNanoseconds ?? 0,
          dev: existingEntry?.dev ?? 0,
          ino: existingEntry?.ino ?? 0,
          mode: parseInt(treeEntry.mode, 8),
          uid: existingEntry?.uid ?? 0,
          gid: existingEntry?.gid ?? 0,
          size: existingEntry?.size ?? 0,
          oid: treeEntry.oid,
          flags: existingEntry?.flags ?? createFlags(treeEntry.path),
          path: treeEntry.path,
        };

        if (existingIndex >= 0) {
          index.entries[existingIndex] = entry;
        } else {
          index.entries.push(entry);
        }

        result.unstaged.push(file);
      } else if (existingIndex >= 0) {
        // File doesn't exist in HEAD but is staged: remove it from index
        index.entries.splice(existingIndex, 1);
        result.unstaged.push(file);
      }
    }
  }

  // Sort entries by path to maintain index order
  index.entries.sort((a, b) => a.path.localeCompare(b.path));

  await writeIndex(fs, gitdir, index);

  return result;
}

/**
 * Get a map of all paths in the HEAD tree.
 * Returns an empty map if HEAD is unborn (no commits yet).
 * Recursively walks through subdirectories to collect all file paths.
 */
async function getHeadTreeMap(
  fs: FSAdapter,
  gitdir: string,
): Promise<Map<string, TreeEntryRaw>> {
  const map = new Map<string, TreeEntryRaw>();

  const head = await resolveHead(fs, gitdir);
  if (!head) {
    return map;
  }

  let commitOid: string | null = null;

  if (head.type === 'commit') {
    commitOid = head.oid;
  } else if (head.type === 'symbolic') {
    commitOid = await readRef(fs, gitdir, head.ref);
  }

  if (!commitOid) {
    return map;
  }

  try {
    const { content } = await readObject(fs, gitdir, commitOid);
    const treeOid = parseTreeOidFromCommit(content);

    if (treeOid) {
      await collectTreeEntries(fs, gitdir, treeOid, '', map);
    }
  } catch {
    // If we can't read HEAD, return empty map (unborn branch)
  }

  return map;
}

/**
 * Recursively collect all file entries from a tree.
 * Files are added to the map with their full paths.
 * Directories are traversed recursively.
 */
async function collectTreeEntries(
  fs: FSAdapter,
  gitdir: string,
  treeOid: string,
  prefix: string,
  map: Map<string, TreeEntryRaw>,
): Promise<void> {
  try {
    const { content } = await readObject(fs, gitdir, treeOid);
    const entries = deserializeTree(content);

    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;

      // Directory/tree mode is '40000' or '040000'
      if (entry.mode === '040000' || entry.mode === '40000') {
        // It's a directory (tree), recurse into it
        await collectTreeEntries(fs, gitdir, entry.oid, fullPath, map);
      } else {
        // It's a file (blob), add to map with full path
        map.set(fullPath, { ...entry, path: fullPath });
      }
    }
  } catch {
    // If we can't read a tree, skip it
  }
}

function parseTreeOidFromCommit(content: Uint8Array): string | null {
  const str = new TextDecoder().decode(content);
  const lines = str.split('\n');

  for (const line of lines) {
    if (line.startsWith('tree ')) {
      return line.slice(5);
    }
  }

  return null;
}
