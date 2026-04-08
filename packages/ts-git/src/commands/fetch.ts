import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { readObject, writeObject, hasObject } from '../core/objects.js';
import { readRef, writeRef, invalidatePackedRefsCache } from '../core/refs.js';
import { getRemote } from './remote.js';
import { NotAGitRepoError, FetchError } from '../errors.js';

// Use global fetch for HTTP requests
const httpFetch = globalThis.fetch.bind(globalThis);

/**
 * Parse a Git URL into protocol and repository info.
 */
export function parseGitUrl(url: string): {
  protocol: 'file' | 'http' | 'https' | 'ssh';
  host?: string;
  port?: string;
  path: string;
  username?: string;
} {
  // File protocol
  if (!url.includes('://') || url.startsWith('file://')) {
    return { protocol: 'file', path: url.replace('file://', '') };
  }

  // SSH format: [user@]host[:path]
  if (url.includes(':') && !url.includes('://')) {
    const colonIndex = url.indexOf(':');
    const beforeColon = url.slice(0, colonIndex);
    const afterColon = url.slice(colonIndex + 1);
    
    if (beforeColon.includes('@')) {
      const [user, host] = beforeColon.split('@');
      return { protocol: 'ssh', host, path: afterColon, username: user };
    }
    return { protocol: 'ssh', host: beforeColon, path: afterColon };
  }

  // HTTP/HTTPS format: http[s]://[user@]host[:port]/path
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const match = url.match(/^https?:\/\/(?:([^@]+)@)?([^:\/]+)(?::(\d+))?(\/.*)$/);
    if (match) {
      const [, user, host, port, path] = match;
      return {
        protocol: url.startsWith('https://') ? 'https' : 'http',
        host,
        port,
        path,
        username: user,
      };
    }
  }

  // Default to file
  return { protocol: 'file', path: url };
}

/**
 * Fetch refs from a remote repository using git's protocol.
 * This is a simplified implementation supporting basic HTTP and file protocols.
 */
export interface FetchResult {
  remote: string;
  fetchedRefs: { name: string; oid: string; oldOid?: string }[];
  newObjects: number;
}

export async function fetch(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  remote: string;
  refspecs?: string[];
  noTags?: boolean;
  tags?: string[];
}): Promise<FetchResult> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), remote, refspecs: _refspecs, noTags: _noTags } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  // Get remote configuration
  const remoteInfo = await getRemote({ fs, dir, gitdir, name: remote });
  if (!remoteInfo) {
    throw new FetchError(`error: remote '${remote}' not found`);
  }

  const parsedUrl = parseGitUrl(remoteInfo.url);
  let fetchedRefs: { name: string; oid: string; oldOid?: string }[] = [];

  if (parsedUrl.protocol === 'file') {
    fetchedRefs = await fetchFromLocal(fs, dir, gitdir, parsedUrl.path, remote, remoteInfo.fetch);
  } else if (parsedUrl.protocol === 'http' || parsedUrl.protocol === 'https') {
    fetchedRefs = await fetchFromHttp(fs, dir, gitdir, remoteInfo.url, remote, remoteInfo.fetch);
  } else {
    throw new FetchError(`unsupported protocol: ${parsedUrl.protocol}`);
  }

  return {
    remote,
    fetchedRefs,
    newObjects: 0, // Would need to track actual objects fetched
  };
}

/**
 * Fetch from a local repository (file:// or direct path).
 */
async function fetchFromLocal(
  fs: FSAdapter,
  _dir: string,
  gitdir: string,
  remotePath: string,
  remoteName: string,
  fetchRefspec: string,
): Promise<{ name: string; oid: string; oldOid?: string }[]> {
  const fetchedRefs: { name: string; oid: string; oldOid?: string }[] = [];
  const remoteGitDir = remotePath;

  // Ensure it's a git directory
  if (!(await fs.exists(remoteGitDir))) {
    throw new FetchError(`repository not found: ${remotePath}`);
  }

  // Parse fetch refspec: +refs/heads/*:refs/remotes/origin/*
  const srcPattern = parseRefspec(fetchRefspec);
  
  // Get list of refs from remote
  const remoteRefs = await getRemoteRefs(fs, remoteGitDir);

  for (const [srcRef, srcOid] of remoteRefs) {
    // Match against source pattern
    let dstRef = srcRef;
    if (srcPattern.includePrefix) {
      dstRef = srcPattern.dstPrefix + srcRef.replace(srcPattern.srcPrefix, '');
    } else {
      dstRef = srcPattern.dstPrefix + srcRef;
    }

    // Get existing OID if any
    const oldOid = await readRef(fs, gitdir, dstRef);

    // Update local ref if needed
    if (!oldOid || oldOid !== srcOid) {
      await writeRef(fs, gitdir, dstRef, srcOid, true);
      fetchedRefs.push({
        name: dstRef,
        oid: srcOid,
        oldOid: oldOid ?? undefined,
      });
    }

    // Also fetch the commit's tree objects
    await fetchObjectRecursive(fs, gitdir, remoteGitDir, srcOid);
  }

  invalidatePackedRefsCache(gitdir);
  return fetchedRefs;
}

/**
 * Fetch from an HTTP/HTTPS repository using smart protocol.
 */
async function fetchFromHttp(
  fs: FSAdapter,
  _dir: string,
  gitdir: string,
  baseUrl: string,
  remoteName: string,
  _fetchRefspec: string,
): Promise<{ name: string; oid: string; oldOid?: string }[]> {
  // This is a simplified implementation
  // In production, you'd implement the full Git smart protocol over HTTP
  const fetchedRefs: { name: string; oid: string; oldOid?: string }[] = [];

  // For now, just try basic info/refs endpoints
  try {
    const refsUrl = baseUrl.replace(/\/$/, '') + '/info/refs?service=git-upload-pack';
    const response = await httpFetch(refsUrl);
    
    if (!response.ok) {
      throw new FetchError(`HTTP error: ${response.status}`);
    }

    const text = await response.text();
    // Parse info/refs response
    // This is a simplified parser
    const oidMatch = /([a-f0-9]{40})\s+(refs\/[^\s]+)/g;
    let match;
    while ((match = oidMatch.exec(text)) !== null) {
      const [, oid, ref] = match;
      const dstRef = 'refs/remotes/' + remoteName + '/' + ref.replace('refs/heads/', '');
      
      const oldOid = await readRef(fs, gitdir, dstRef);
      if (!oldOid || oldOid !== oid) {
        await writeRef(fs, gitdir, dstRef, oid, true);
        fetchedRefs.push({
          name: dstRef,
          oid,
          oldOid: oldOid ?? undefined,
        });
      }
    }
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    throw new FetchError(`fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  invalidatePackedRefsCache(gitdir);
  return fetchedRefs;
}

/**
 * Parse a Git refspec.
 */
function parseRefspec(refspec: string): {
  srcPrefix: string;
  dstPrefix: string;
  includePrefix: boolean;
} {
  // Format: +refs/heads/*:refs/remotes/origin/*
  const colonIdx = refspec.indexOf(':');
  const src = refspec.slice(1); // Remove leading +
  const dst = refspec.slice(colonIdx + 1);

  const srcStarIdx = src.indexOf('*');
  const dstStarIdx = dst.indexOf('*');

  return {
    srcPrefix: srcStarIdx > 0 ? src.slice(0, srcStarIdx) : src,
    dstPrefix: dstStarIdx > 0 ? dst.slice(0, dstStarIdx) : dst,
    includePrefix: srcStarIdx > 0,
  };
}

/**
 * Get all refs from a local repository.
 */
async function getRemoteRefs(
  fs: FSAdapter,
  gitdir: string,
): Promise<[string, string][]> {
  const refs: [string, string][] = [];

  // Get loose refs
  const headsPath = joinPaths(gitdir, 'refs', 'heads');
  if (await fs.exists(headsPath)) {
    await collectRefs(fs, headsPath, 'refs/heads/', refs);
  }

  const tagsPath = joinPaths(gitdir, 'refs', 'tags');
  if (await fs.exists(tagsPath)) {
    await collectRefs(fs, tagsPath, 'refs/tags/', refs);
  }

  // Get packed refs
  const packedRefsPath = joinPaths(gitdir, 'packed-refs');
  if (await fs.exists(packedRefsPath)) {
    const content = await fs.readFileString(packedRefsPath);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('^')) {
        continue;
      }
      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace === -1) continue;
      const oid = trimmed.slice(0, firstSpace);
      const refName = trimmed.slice(firstSpace + 1).trim();
      if (/^[a-f0-9]{40}$/i.test(oid) && refName) {
        refs.push([refName, oid]);
      }
    }
  }

  // Also get HEAD
  const headPath = joinPaths(gitdir, 'HEAD');
  if (await fs.exists(headPath)) {
    const content = await fs.readFileString(headPath).catch(() => '');
    const trimmed = content.trim();
    if (trimmed.startsWith('ref: ')) {
      const targetRef = trimmed.slice(5);
      const targetOid = await readRef(fs, gitdir, targetRef);
      if (targetOid) {
        refs.push(['HEAD', targetOid]);
      }
    } else if (/^[a-f0-9]{40}$/i.test(trimmed)) {
      refs.push(['HEAD', trimmed]);
    }
  }

  return refs;
}

async function collectRefs(
  fs: FSAdapter,
  basePath: string,
  prefix: string,
  refs: [string, string][],
): Promise<void> {
  try {
    const entries = await fs.readdir(basePath);
    for (const entry of entries) {
      const fullPath = joinPaths(basePath, entry.name);
      if (entry.isDirectory) {
        await collectRefs(fs, fullPath, prefix + entry.name + '/', refs);
      } else {
        const oid = await fs.readFileString(fullPath).catch(() => '');
        if (/^[a-f0-9]{40}$/i.test(oid.trim())) {
          refs.push([prefix + entry.name, oid.trim()]);
        }
      }
    }
  } catch {
    // Directory might not exist
  }
}

/**
 * Recursively fetch all objects needed for a given OID.
 */
async function fetchObjectRecursive(
  fs: FSAdapter,
  gitdir: string,
  remoteGitdir: string,
  oid: string,
): Promise<void> {
  // Don't refetch what we already have
  if (await hasObject(fs, gitdir, oid)) {
    return;
  }

  try {
    // Read the object from remote
    const { type, content } = await readObject(fs, remoteGitdir, oid);

    // Write to local
    await writeObject(fs, gitdir, type, content);

    // If it's a commit, also fetch the tree
    if (type === 'commit') {
      const commitStr = new TextDecoder().decode(content);
      for (const line of commitStr.split('\n')) {
        if (line.startsWith('tree ')) {
          const treeOid = line.slice(5).trim();
          await fetchObjectRecursive(fs, gitdir, remoteGitdir, treeOid);
        }
      }
    }

    // If it's a tree, also fetch all blob objects
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
          await fetchObjectRecursive(fs, gitdir, remoteGitdir, oidHex);
        }
        offset = nullIndex + 21;
      }
    }
  } catch {
    // Object not found or error - skip
  }
}