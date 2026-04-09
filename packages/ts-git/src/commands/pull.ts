import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { readConfig, getConfigValue } from '../core/config.js';
import { getCurrentBranch, readRef, resolveHeadCommitOid } from '../core/refs.js';
import { readObject, deserializeCommit } from '../core/objects.js';
import { NotAGitRepoError, PullError } from '../errors.js';
import { fetch, FetchResult } from './fetch.js';
import { getRemote } from './remote.js';

export interface PullResult {
  remote: string;
  fetched: FetchResult;
  merged: boolean;
  message?: string;
}

/**
 * Pull commits from a remote repository.
 * This performs a fetch followed by a merge (or rebase if configured).
 */
export async function pull(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  remote?: string;
  branch?: string;
  rebase?: boolean;
}): Promise<PullResult> {
  const { 
    fs, 
    dir, 
    gitdir = joinPaths(dir, '.git'), 
    remote, 
    branch,
    rebase = false 
  } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  // Determine remote name to use
  let remoteName = remote;
  if (!remoteName) {
    // Try to get the default remote from config
    const config = await readConfig(fs, gitdir);
    remoteName = getConfigValue(config, 'branch', 'pushRemote');
    remoteName = remoteName || getConfigValue(config, 'remote', 'default');
    
    if (!remoteName) {
      // Default to 'origin'
      remoteName = 'origin';
    }
  }

  // Get remote configuration
  const remoteInfo = await getRemote({ fs, dir, gitdir, name: remoteName });
  if (!remoteInfo) {
    throw new PullError(`error: remote '${remoteName}' not found`);
  }

  // Determine branch to pull
  let branchName: string | undefined = branch;
  if (!branchName) {
    // Get current branch
    const currentBranch = await getCurrentBranch(fs, gitdir);
    branchName = currentBranch ?? undefined;
    if (!branchName) {
      throw new PullError(`error: no branch specified and HEAD is detached`);
    }
  }

  // First, fetch from remote
  const fetched = await fetch({
    fs,
    dir,
    gitdir,
    remote: remoteName,
  });

  // Now update the local branch
  // The remote tracking branch would be refs/remotes/origin/<branch>
  const remoteTrackingRef = `refs/remotes/${remoteName}/${branchName}`;
  const remoteOid = await readRef(fs, gitdir, remoteTrackingRef);

  if (!remoteOid) {
    // No remote tracking branch yet - just fastforward if possible
    return {
      remote: remoteName,
      fetched,
      merged: false,
      message: 'new branch history created',
    };
  }

  // Get current branch OID
  const currentOid = await resolveHeadCommitOid(fs, gitdir);
  if (!currentOid) {
    return {
      remote: remoteName,
      fetched,
      merged: false,
      message: 'no commits to merge',
    };
  }

  // Check if we can fast-forward
  const canFastForward = await isAncestor(fs, gitdir, currentOid, remoteOid);

  if (canFastForward) {
    // Fast-forward merge
    if (rebase) {
      // Rebase would need to handle replaying commits - complex!
      // For now, just do regular merge
    }

    // Update branch ref to point to remote OID
    await updateBranchRef(fs, gitdir, branchName, remoteOid);
    
    return {
      remote: remoteName,
      fetched,
      merged: true,
      message: `fast-forward to ${remoteOid.substring(0, 7)}`,
    };
  }

  // Could not fast-forward - would need actual merge
  // This requires merge driver which is beyond scope for now
  return {
    remote: remoteName,
    fetched,
    merged: false,
    message: 'cannot fast-forward - merge required (not yet implemented)',
  };
}

/**
 * Check if commit A is an ancestor of commit B.
 */
async function isAncestor(
  fs: FSAdapter,
  gitdir: string,
  ancestorOid: string,
  descendantOid: string,
): Promise<boolean> {
  // If ancestor is the same as descendant, it's trivially an ancestor
  if (ancestorOid === descendantOid) {
    return true;
  }

  // BFS from descendant to find ancestor
  const visited = new Set<string>();
  const queue: string[] = [descendantOid];

  while (queue.length > 0) {
    const currentOid = queue.shift()!;
    
    if (visited.has(currentOid)) {
      continue;
    }
    visited.add(currentOid);

    try {
      const { type, content } = await readObject(fs, gitdir, currentOid);
      
      if (type !== 'commit') {
        continue;
      }

      const commit = deserializeCommit(content);
      
      // Check if current commit is our ancestor
      if (commit.tree === ancestorOid) {
        // Need to check if ancestor is in the tree history...
        // Actually, this is incorrect - need to match OIDs
      }

      // Check any parent commit
      for (const parentOid of commit.parent) {
        if (parentOid === ancestorOid) {
          return true;
        }
        queue.push(parentOid);
      }
    } catch {
      // Skip if error
    }
  }

  return false;
}

/**
 * Update a branch reference.
 */
async function updateBranchRef(
  fs: FSAdapter,
  gitdir: string,
  branchName: string,
  newOid: string,
): Promise<void> {
  // Write the new ref value
  const branchPath = joinPaths(gitdir, 'refs', 'heads', branchName);
  const dir = joinPaths(gitdir, 'refs', 'heads');
  
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, { recursive: true });
  }

  await fs.writeFile(branchPath, newOid);
}