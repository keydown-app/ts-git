import { FSAdapter } from '../fs/types.js';
import { parseGitDir } from '../utils/path.js';
import { resolveHead, readRef } from '../core/refs.js';
import { readObject, deserializeCommit } from '../core/objects.js';
import { NotAGitRepoError } from '../errors.js';
import type { LogArgs, LogEntry } from '../types.js';

export async function log(args: LogArgs): Promise<LogEntry[]> {
  const { fs, dir, gitdir: providedGitdir, depth } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const head = await resolveHead(fs, gitdir);

  if (!head) {
    return [];
  }

  let currentOid: string | null = null;

  if (head.type === 'commit') {
    currentOid = head.oid;
  } else if (head.type === 'symbolic') {
    currentOid = await readRef(fs, gitdir, head.ref);
  }

  if (!currentOid) {
    return [];
  }

  const commits: LogEntry[] = [];
  const maxDepth = depth ?? Infinity;

  const visited = new Set<string>();

  while (currentOid && commits.length < maxDepth) {
    if (visited.has(currentOid)) {
      break;
    }
    visited.add(currentOid);

    try {
      const { content } = await readObject(fs, gitdir, currentOid);
      const commitObj = deserializeCommit(content);

      commits.push({
        oid: currentOid,
        commit: commitObj,
      });

      if (commitObj.parent.length === 0) {
        break;
      }

      currentOid = commitObj.parent[0];
    } catch {
      break;
    }
  }

  return commits;
}

export async function readCommit(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  oid: string;
}): Promise<LogEntry> {
  const { fs, dir, gitdir: providedGitdir, oid } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const { content } = await readObject(fs, gitdir, oid);
  const commitObj = deserializeCommit(content);

  return {
    oid,
    commit: commitObj,
  };
}
