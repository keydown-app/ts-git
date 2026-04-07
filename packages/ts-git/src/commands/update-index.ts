import { FSAdapter } from '../fs/types.js';
import { joinPaths, normalizeRepoRelativePath } from '../utils/path.js';
import { readIndex, writeIndex, createIndexEntry, updateIndexEntry, removeIndexEntry } from '../core/index.js';
import { computeOid } from '../core/objects.js';

export interface UpdateIndexArgs {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  add?: boolean;
  remove?: boolean;
  filepath: string | string[];
  force?: boolean;
}

export interface UpdateIndexResult {
  added: string[];
  removed: string[];
  updated: string[];
}

export async function updateIndex(args: UpdateIndexArgs): Promise<UpdateIndexResult> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), add = false, remove = false, filepath, force = false } = args;
  const files = Array.isArray(filepath) ? filepath : [filepath];
  const index = await readIndex(fs, gitdir);
  const result: UpdateIndexResult = { added: [], removed: [], updated: [] };

  for (const file of files) {
    const normalizedPath = normalizeRepoRelativePath(file);
    if (remove) {
      removeIndexEntry(index, normalizedPath);
      result.removed.push(normalizedPath);
    } else if (add || force) {
      const filepathToCheck = file.startsWith('/') ? file : joinPaths(dir, file);
      if (!(await fs.exists(filepathToCheck))) throw new Error(`File not found: ${filepathToCheck}`);
      const stat = await fs.stat(filepathToCheck);
      const fileContent = await fs.readFile(filepathToCheck);
      const oid = await computeOid('blob', fileContent);
      const entry = createIndexEntry({ path: normalizedPath, oid, mode: 0o100644, mtimeMs: stat.mtimeMs, size: stat.size });
      updateIndexEntry(index, entry);
      const existing = index.entries.findIndex(e => e.path === normalizedPath);
      if (existing >= 0) result.updated.push(normalizedPath);
      else result.added.push(normalizedPath);
    }
  }
  await writeIndex(fs, gitdir, index);
  return result;
}