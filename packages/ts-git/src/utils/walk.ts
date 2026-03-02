import type { FSAdapter } from '../fs/types.js';
import { parseIgnoreFile, IgnorePattern, createMatcher } from './gitignore.js';
import { normalizeRepoRelativePath } from './path.js';

export type WalkOptions = {
  ignoreFiles?: string[];
  ignorePatterns?: IgnorePattern[];
  gitdir?: string;
};

export async function walkDir(
  fs: FSAdapter,
  dir: string,
  options?: WalkOptions,
): Promise<string[]> {
  const ignoreFiles = options?.ignoreFiles ?? ['.gitignore'];
  const basePatterns = options?.ignorePatterns ?? [];
  const providedGitdir = options?.gitdir;

  const results: string[] = [];
  const patterns: IgnorePattern[] = [...basePatterns];

  // Always ignore the default .git directory at any level
  patterns.push({
    pattern: '.git',
    regex: /^(?:.*\/)?\.git$/,
    negative: false,
    directoryOnly: true,
    anchoredToRoot: false,
    relativeTo: '',
  });

  // If a custom gitdir is provided and it's within the walk directory, ignore it too
  if (providedGitdir && providedGitdir.startsWith(dir + '/')) {
    const relativeGitdir = providedGitdir.slice(dir.length + 1);
    // Escape special regex characters in the path
    const escapedPath = relativeGitdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({
      pattern: relativeGitdir,
      regex: new RegExp('^' + escapedPath + '$'),
      negative: false,
      directoryOnly: true,
      anchoredToRoot: true,
      relativeTo: '',
    });
  }

  await walkRecursive(fs, dir, '', patterns, ignoreFiles, results);

  return results;
}

async function walkRecursive(
  fs: FSAdapter,
  baseDir: string,
  relativeDir: string,
  patterns: IgnorePattern[],
  ignoreFiles: string[],
  results: string[],
): Promise<void> {
  const currentDir = relativeDir === '' ? baseDir : `${baseDir}/${relativeDir}`;

  // Check for ignore files in this directory
  for (const ignoreFile of ignoreFiles) {
    const ignoreFilePath = `${currentDir}/${ignoreFile}`;
    try {
      if (await fs.exists(ignoreFilePath)) {
        const content = await fs.readFileString(ignoreFilePath);
        const newPatterns = parseIgnoreFile(content, relativeDir);
        patterns.push(...newPatterns);
      }
    } catch {
      // Ignore file doesn't exist or can't be read
    }
  }

  // Create matcher with current patterns
  const matcher = createMatcher(patterns);

  // Read directory contents
  let entries;
  try {
    entries = await fs.readdir(currentDir);
  } catch {
    // Directory doesn't exist or can't be read
    return;
  }

  for (const entry of entries) {
    const entryRelativePath =
      relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;

    // Check if this entry should be ignored
    if (matcher(entryRelativePath, entry.isDirectory)) {
      continue;
    }

    if (entry.isDirectory) {
      // Recurse into subdirectory
      await walkRecursive(
        fs,
        baseDir,
        entryRelativePath,
        patterns,
        ignoreFiles,
        results,
      );
    } else if (entry.isFile) {
      results.push(normalizeRepoRelativePath(entryRelativePath));
    }
  }
}
