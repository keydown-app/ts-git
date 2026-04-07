import { FSAdapter } from '../fs/types.js';
import { writeObject, computeOid } from '../core/objects.js';
import { joinPaths } from '../utils/path.js';
import { createIndexEntry, readIndex, writeIndex } from '../core/index.js';

export interface HashObjectArgs {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  object: Uint8Array;
  filepath?: string;
  write?: boolean;
  revoke?: boolean;
}

export interface HashObjectResult {
  oid: string;
  written: boolean;
}

export async function hashObject(args: HashObjectArgs): Promise<HashObjectResult> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), object, filepath, write = false } = args;
  const oid = await computeOid('blob', object);

  if (write) {
    await writeObject(fs, gitdir, 'blob', object);
    if (filepath) {
      const stat = await fs.stat(filepath);
      const index = await readIndex(fs, gitdir);
      const entry = createIndexEntry({
        path: filepath,
        oid,
        mode: 0o100644,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      });
      const existing = index.entries.findIndex(e => e.path === filepath);
      if (existing >= 0) index.entries[existing] = entry;
      else index.entries.push(entry);
      await writeIndex(fs, gitdir, index);
    }
    return { oid, written: true };
  }
  return { oid, written: false };
}

export async function hashObjectString(args: Omit<HashObjectArgs, 'object'> & { content: string }): Promise<HashObjectResult> {
  const encoder = new TextEncoder();
  return hashObject({ ...args, object: encoder.encode(args.content) });
}