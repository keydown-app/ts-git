import { FSAdapter } from '../fs/types.js';
import { parseGitDir } from '../utils/path.js';
import {
  resolveHead,
  writeRef,
  deleteRef,
  listBranches,
  getCurrentBranch,
  setHead,
  readRef,
} from '../core/refs.js';
import { readObject } from '../core/objects.js';
import {
  NotFoundError,
  AlreadyExistsError,
  InvalidRefError,
  NotAGitRepoError,
} from '../errors.js';
import type {
  BranchArgs,
  BranchListArgs,
  BranchDeleteArgs,
  BranchListResult,
} from '../types.js';

export async function branch(args: BranchArgs): Promise<string> {
  const {
    fs,
    dir,
    gitdir: providedGitdir,
    ref,
    object,
    checkout = false,
    force = false,
  } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  let targetOid: string;

  if (object) {
    targetOid = object;
  } else {
    const head = await resolveHead(fs, gitdir);
    if (!head) {
      throw new InvalidRefError(
        'Cannot create branch: HEAD is not pointing to a commit',
      );
    }
    if (head.type === 'commit') {
      targetOid = head.oid;
    } else if (head.type === 'symbolic') {
      const oid = await readRef(fs, gitdir, head.ref);
      if (!oid) {
        throw new InvalidRefError(
          'Cannot create branch: HEAD is not pointing to a commit',
        );
      }
      targetOid = oid;
    } else {
      throw new InvalidRefError(
        'Cannot create branch: HEAD is not pointing to a commit',
      );
    }
  }

  const branchRef = `refs/heads/${ref}`;
  const existingRef = await readRef(fs, gitdir, branchRef);

  if (existingRef && !force) {
    throw new AlreadyExistsError(`Branch '${ref}' already exists`, branchRef);
  }

  await writeRef(fs, gitdir, branchRef, targetOid, force);

  if (checkout) {
    await setHead(fs, gitdir, branchRef);
  }

  return targetOid;
}

export async function listBranchesCommand(
  args: BranchListArgs,
): Promise<BranchListResult> {
  const { fs, dir, gitdir: providedGitdir } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const branches = await listBranches(fs, gitdir);
  const current = await getCurrentBranch(fs, gitdir);

  return {
    branches,
    current,
  };
}

export async function deleteBranch(args: BranchDeleteArgs): Promise<void> {
  const { fs, dir, gitdir: providedGitdir, ref, force = false } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const branchRef = `refs/heads/${ref}`;
  const branchOid = await readRef(fs, gitdir, branchRef);

  if (!branchOid) {
    throw new NotFoundError(`Branch '${ref}' not found`, branchRef);
  }

  const currentBranch = await getCurrentBranch(fs, gitdir);

  if (currentBranch === ref) {
    throw new InvalidRefError(`Cannot delete the branch you are currently on`);
  }

  // Check mergedness unless force is true
  if (!force) {
    const head = await resolveHead(fs, gitdir);
    let headOid: string | null = null;

    if (head) {
      if (head.type === 'commit') {
        headOid = head.oid;
      } else if (head.type === 'symbolic') {
        headOid = await readRef(fs, gitdir, head.ref);
      }
    }

    if (headOid && !(await isReachable(fs, gitdir, headOid, branchOid))) {
      throw new InvalidRefError(
        `The branch '${ref}' is not fully merged. Use force to delete.`,
      );
    }
  }

  await deleteRef(fs, gitdir, branchRef);
}

/**
 * Check if target commit is reachable from source commit via parent traversal.
 * This is a simplified reachability check for the mergedness test.
 */
async function isReachable(
  fs: FSAdapter,
  gitdir: string,
  sourceOid: string,
  targetOid: string,
): Promise<boolean> {
  // Same commit is always reachable
  if (sourceOid === targetOid) {
    return true;
  }

  const visited = new Set<string>();
  const queue: string[] = [sourceOid];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === targetOid) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    try {
      const { content } = await readObject(fs, gitdir, current);
      const commit = deserializeCommitForReachability(content);

      for (const parent of commit.parent) {
        queue.push(parent);
      }
    } catch {
      // If we can't read the commit, skip it
    }
  }

  return false;
}

function deserializeCommitForReachability(content: Uint8Array): {
  parent: string[];
} {
  const str = new TextDecoder().decode(content);
  const lines = str.split('\n');
  const parent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('parent ')) {
      parent.push(line.slice(7));
    }
  }

  return { parent };
}

export async function checkoutBranch(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  ref: string;
  force?: boolean;
}): Promise<void> {
  const { fs, dir, gitdir: providedGitdir, ref } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const branchRef = `refs/heads/${ref}`;
  const branchOid = await readRef(fs, gitdir, branchRef);

  if (!branchOid) {
    throw new NotFoundError(`Branch '${ref}' not found`, branchRef);
  }

  await setHead(fs, gitdir, branchRef);
}
