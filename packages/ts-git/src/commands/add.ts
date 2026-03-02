import { FSAdapter } from '../fs/types.js';
import { parseGitDir, joinPaths } from '../utils/path.js';
import { normalizeFileMode, modeToNumber, FileMode } from '../types.js';
import { writeObject } from '../core/objects.js';
import { readIndex, writeIndex, IndexEntry } from '../core/index.js';
import { IsADirectoryError, NotAGitRepoError } from '../errors.js';

export interface AddResult {
  added: string[];
  updated: string[];
  removed?: string[];
}

export async function add(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  filepath: string | string[];
  force?: boolean;
}): Promise<AddResult> {
  const { fs, dir, gitdir: providedGitdir, filepath } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const files = Array.isArray(filepath) ? filepath : [filepath];

  const result: AddResult = {
    added: [],
    updated: [],
  };

  const index = await readIndex(fs, gitdir);

  for (const file of files) {
    const fileResults = await addFile(fs, dir, gitdir, file, index);
    if (fileResults) {
      for (const { path, updated } of fileResults) {
        if (updated) {
          result.updated.push(path);
        } else {
          result.added.push(path);
        }
      }
    }
  }

  await writeIndex(fs, gitdir, index);

  return result;
}

interface FileResult {
  path: string;
  updated: boolean;
}

async function addFile(
  fs: FSAdapter,
  dir: string,
  gitdir: string,
  filepath: string,
  index: { entries: IndexEntry[] },
): Promise<FileResult[] | null> {
  const fullPath = joinPaths(dir, filepath);

  const stats = await fs.stat(fullPath);

  if (stats.isDirectory) {
    // Recursively add all files in the directory
    return await addDirectory(fs, dir, gitdir, filepath, index);
  }

  const result = await addSingleFile(fs, dir, gitdir, filepath, index, stats);
  return result ? [result] : null;
}

async function addDirectory(
  fs: FSAdapter,
  dir: string,
  gitdir: string,
  dirpath: string,
  index: { entries: IndexEntry[] },
): Promise<FileResult[] | null> {
  const fullDirPath = joinPaths(dir, dirpath);
  const entries = await fs.readdir(fullDirPath);

  const results: FileResult[] = [];

  for (const entry of entries) {
    // Skip .git directory
    if (entry.name === '.git') continue;

    const entryPath = dirpath ? `${dirpath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      const dirResults = await addDirectory(fs, dir, gitdir, entryPath, index);
      if (dirResults) {
        results.push(...dirResults);
      }
    } else {
      const fileResults = await addFile(fs, dir, gitdir, entryPath, index);
      if (fileResults) {
        results.push(...fileResults);
      }
    }
  }

  return results.length > 0 ? results : null;
}

async function addSingleFile(
  fs: FSAdapter,
  dir: string,
  gitdir: string,
  filepath: string,
  index: { entries: IndexEntry[] },
  stats: {
    isDirectory: boolean;
    mode: number;
    ctimeMs: number;
    mtimeMs: number;
    dev: number;
    ino: number;
    uid: number;
    gid: number;
    size: number;
  },
): Promise<FileResult | null> {
  const fullPath = joinPaths(dir, filepath);

  const content = await fs.readFile(fullPath);

  const mode = normalizeFileMode(stats.mode) as FileMode;
  const modeNum = modeToNumber(mode);

  const oid = await writeObject(fs, gitdir, 'blob', content);

  const existingEntry = index.entries.find(
    (e: IndexEntry) => e.path === filepath,
  );

  if (existingEntry) {
    if (existingEntry.oid === oid) {
      return null;
    }

    index.entries = index.entries.filter(
      (e: IndexEntry) => e.path !== filepath,
    );
    index.entries.push({
      ctimeSeconds: Math.floor(stats.ctimeMs / 1000),
      ctimeNanoseconds: Math.floor((stats.ctimeMs % 1000) * 1000000),
      mtimeSeconds: Math.floor(stats.mtimeMs / 1000),
      mtimeNanoseconds: Math.floor((stats.mtimeMs % 1000) * 1000000),
      dev: stats.dev,
      ino: stats.ino,
      mode: modeNum,
      uid: stats.uid,
      gid: stats.gid,
      size: stats.size,
      oid,
      flags: filepath.length & 0xfff,
      path: filepath,
    });

    return { path: filepath, updated: true };
  }

  index.entries.push({
    ctimeSeconds: Math.floor(stats.ctimeMs / 1000),
    ctimeNanoseconds: Math.floor((stats.ctimeMs % 1000) * 1000000),
    mtimeSeconds: Math.floor(stats.mtimeMs / 1000),
    mtimeNanoseconds: Math.floor((stats.mtimeMs % 1000) * 1000000),
    dev: stats.dev,
    ino: stats.ino,
    mode: modeNum,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    oid,
    flags: filepath.length & 0xfff,
    path: filepath,
  });

  return { path: filepath, updated: false };
}

export async function addAll(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  force?: boolean;
}): Promise<AddResult> {
  const { fs, dir, gitdir: providedGitdir } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  // Import statusMatrix here to avoid circular dependency
  const { statusMatrix } = await import('./status.js');

  // Get the git directory name relative to the repo dir
  const gitdirName = gitdir.slice(dir.length + 1);

  const status = await statusMatrix({
    fs,
    dir,
    gitdir,
    filter: (filepath: string) => !filepath.startsWith(gitdirName + '/'),
  });

  const filesToAdd: string[] = [];
  const filesToRemove: string[] = [];

  for (const [filepath, head, workdir, stage] of status) {
    // Add files that are new (0,2) or modified (1,2)
    if (head === 0 && workdir === 2) {
      filesToAdd.push(filepath);
    } else if (head === 1 && workdir === 2) {
      filesToAdd.push(filepath);
    } else if (workdir === 0 && stage !== 0) {
      // Remove files that are deleted from workdir but still in index
      // This handles both committed files (head=1) and staged files (head=0, stage!=0)
      filesToRemove.push(filepath);
    }
  }

  // Handle file removals first
  if (filesToRemove.length > 0) {
    await remove({ fs, dir, gitdir: providedGitdir, filepath: filesToRemove });
  }

  // Handle file additions/modifications
  if (filesToAdd.length === 0) {
    return { added: [], updated: [], removed: filesToRemove };
  }

  const result = await add({
    fs,
    dir,
    gitdir: providedGitdir,
    filepath: filesToAdd,
  });

  // Include removed files in the result
  if (filesToRemove.length > 0) {
    return { ...result, removed: filesToRemove };
  }

  return result;
}

export async function remove(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  filepath: string | string[];
}): Promise<void> {
  const { fs, dir, gitdir: providedGitdir, filepath } = args;
  const { gitdir } = parseGitDir(dir, providedGitdir);

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const files = Array.isArray(filepath) ? filepath : [filepath];

  const index = await readIndex(fs, gitdir);

  for (const file of files) {
    const fullPath = joinPaths(dir, file);

    if (await fs.exists(fullPath)) {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory) {
        throw new IsADirectoryError(
          `Cannot remove directory from index: ${file}`,
          fullPath,
        );
      }
    }

    index.entries = index.entries.filter((e: IndexEntry) => e.path !== file);
  }

  await writeIndex(fs, gitdir, index);
}
