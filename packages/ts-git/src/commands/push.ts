import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { readObject, writeObject, hasObject } from '../core/objects.js';
import { readRef, writeRef, resolveHeadCommitOid } from '../core/refs.js';
import { readConfig, getConfigValue } from '../core/config.js';
import { getRemote } from './remote.js';
import { NotAGitRepoError, PushError } from '../errors.js';
import { parseGitUrl } from './fetch.js';

/**
 * Push commits to a remote repository.
 */
export interface PushResult {
  remote: string;
  pushedRefs: { name: string; oldOid?: string; newOid: string }[];
  errors: string[];
}

export async function push(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  remote?: string;
  refspec?: string;
  remoteBranch?: string;
  force?: boolean;
  noTags?: boolean;
}): Promise<PushResult> {
  const { 
    fs, 
    dir, 
    gitdir = joinPaths(dir, '.git'), 
    remote, 
    refspec, 
    force = false 
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
    const pushRemote = getConfigValue(config, 'branch', 'pushRemote');
    remoteName = pushRemote || getConfigValue(config, 'remote', 'default');
    
    if (!remoteName) {
      // Default to 'origin'
      remoteName = 'origin';
    }
  }

  // Get remote configuration
  const remoteInfo = await getRemote({ fs, dir, gitdir, name: remoteName });
  if (!remoteInfo) {
    throw new PushError(`error: remote '${remoteName}' not found`);
  }

  const parsedUrl = parseGitUrl(remoteInfo.url);
  let pushedRefs: { name: string; oldOid?: string; newOid: string }[] = [];
  const errors: string[] = [];

  // Parse refspec or determine default push refspec
  let srcRef = 'refs/heads/master';
  let dstRef = 'refs/heads/master';
  
  if (refspec) {
    // Parse refspec if provided
    const parts = refspec.split(':');
    srcRef = parts[0];
    dstRef = parts[1] || srcRef;
  } else {
    // Determine current branch
    const headInfo = await resolveHeadCommitOid(fs, gitdir);
    if (headInfo) {
      srcRef = 'HEAD';
    }
  }

  // Get source commit OID
  let srcOid: string | null = null;
  if (srcRef === 'HEAD') {
    srcOid = await resolveHeadCommitOid(fs, gitdir);
  } else {
    srcOid = await readRef(fs, gitdir, srcRef);
  }

  if (!srcOid) {
    // No commits yet - nothing to push
    return {
      remote: remoteName,
      pushedRefs: [],
      errors: ['everything-is-up-to-date'],
    };
  }

  if (parsedUrl.protocol === 'file') {
    const result = await pushToLocal(
      fs, dir, gitdir,
      parsedUrl.path,
      remoteName,
      srcRef,
      srcOid,
      force,
    );
    pushedRefs = result.pushedRefs;
    errors.push(...result.errors);
  } else if (parsedUrl.protocol === 'http' || parsedUrl.protocol === 'https') {
    const result = await pushToHttp(
      fs, dir, gitdir,
      remoteInfo.url,
      remoteName,
      srcRef,
      srcOid,
      force,
    );
    pushedRefs = result.pushedRefs;
    errors.push(...result.errors);
  } else {
    throw new PushError(`unsupported protocol: ${parsedUrl.protocol}`);
  }

  return {
    remote: remoteName,
    pushedRefs,
    errors,
  };
}

/**
 * Push to a local repository.
 */
async function pushToLocal(
  fs: FSAdapter,
  _dir: string,
  gitdir: string,
  remotePath: string,
  remoteName: string,
  srcRef: string,
  srcOid: string,
  _force: boolean,
): Promise<{ pushedRefs: { name: string; oldOid?: string; newOid: string }[]; errors: string[] }> {
  const remoteGitDir = joinPaths(remotePath, '.git');
  const pushedRefs: { name: string; oldOid?: string; newOid: string }[] = [];
  const errors: string[] = [];

  // Push all needed objects
  await pushObjectRecursive(fs, gitdir, remoteGitDir, srcOid);

  // Determine destination ref
  /* eslint-disable no-unused-vars */
  const dstRef = srcRef;
  /* eslint-enable */
  if (srcRef === 'HEAD') {
    dstRef = 'refs/heads/master'; // Would need to detect current branch
  }

  // Check remote ref
  const remoteRefs = await readRef(fs, remoteGitDir, dstRef.replace('refs/heads/', 'refs/heads/'));
  let oldOid: string | undefined;

  if (!force && remoteRefs && remoteRefs !== srcOid) {
    errors.push(`error: failed to push to ${dstRef}: remote ref differs from local`);
    return { pushedRefs, errors };
  }

  // Update remote ref
  if (remoteRefs) {
    oldOid = remoteRefs;
    
    // Try to write the ref
    try {
      await writeRef(fs, remoteGitDir, dstRef, srcOid, true);
    } catch {
      // Might need force
      if (!force) {
        errors.push(`error: failed to update ref - use --force to override`);
        return { pushedRefs, errors };
      }
    }
  }

  pushedRefs.push({ name: dstRef, oldOid, newOid: srcOid });

  return { pushedRefs, errors };
}

/**
 * Push to an HTTP/HTTPS repository.
 */
async function pushToHttp(
  fs: FSAdapter,
  dir: string,
  gitdir: string,
  baseUrl: string,
  remoteName: string,
  srcRef: string,
  srcOid: string,
  force: boolean,
): Promise<{ pushedRefs: { name: string; oldOid?: string; newOid: string }[]; errors: string[] }> {
  // Simplified implementation - full Git protocol over HTTP would be complex
  const pushedRefs: { name: string; oldOid?: string; newOid: string }[] = [];
  const errors: string[] = [];

  // Try to use Git receive-pack
  try {
    const receivePackUrl = baseUrl.replace(/\/$/, '') + '/git-receive-pack';
    
    // For now, we're limited - just note that push via HTTP needs more implementation
    errors.push('push over HTTP not fully implemented - use SSH or local repository');
  } catch (error) {
    errors.push(`push failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return { pushedRefs, errors };
}

/**
 * Recursively push all objects needed for a given OID.
 */
async function pushObjectRecursive(
  fs: FSAdapter,
  localGitdir: string,
  remoteGitdir: string,
  oid: string,
): Promise<void> {
  try {
    // Check if remote already has this object
    if (await hasObject(fs, remoteGitdir, oid)) {
      return;
    }

    // Read the object from local
    const { type, content } = await readObject(fs, localGitdir, oid);

    // Write to remote
    await writeObject(fs, remoteGitdir, type, content);

    // If it's a commit, also push the tree
    if (type === 'commit') {
      const commitStr = new TextDecoder().decode(content);
      for (const line of commitStr.split('\n')) {
        if (line.startsWith('tree ')) {
          const treeOid = line.slice(5).trim();
          await pushObjectRecursive(fs, localGitdir, remoteGitdir, treeOid);
        }
      }
    }

    // If it's a tree, also push all blob objects
    if (type === 'tree') {
      let offset = 0;
      while (offset < content.length) {
        const spaceIndex = content.indexOf(0x20, offset);
        if (spaceIndex === -1) break;
        const nullIndex = content.indexOf(0, spaceIndex);
        if (nullIndex === -1) break;
        
        const oidBytes = content.slice(nullIndex + 1, nullIndex + 21);
        if (oidBytes.length >= 20) {
          let oidHex = '';
          for (let i = 0; i < 20; i++) {
            oidHex += oidBytes[i].toString(16).padStart(2, '0');
          }
          await pushObjectRecursive(fs, localGitdir, remoteGitdir, oidHex);
        }
        offset = nullIndex + 21;
      }
    }
  } catch {
    // Object not found or error - skip
  }
}