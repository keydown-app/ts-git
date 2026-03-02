import * as path from 'path';
import * as fs from 'fs/promises';
import {
  createTestRepo,
  createCommit,
  runGit,
  getGitIndexState,
  type TestRepo,
  type GitIndexEntry,
} from './helpers.js';

/**
 * Shared test setup utilities for integration tests.
 * These functions create pre-configured repository scenarios
 * that can be reused across multiple tests.
 */

/**
 * Creates an empty initialized git repository
 */
export async function setupEmptyRepo(): Promise<TestRepo> {
  return await createTestRepo();
}

/**
 * Creates a repository with a single commit
 */
export async function setupRepoWithCommit(
  files: Record<string, string> = { 'file.txt': 'initial content' },
  message: string = 'Initial commit',
): Promise<TestRepo> {
  const repo = await createTestRepo();
  await createCommit(repo, files, message);
  return repo;
}

/**
 * Creates a repository with staged modifications to an existing file
 */
export async function setupRepoWithStagedChanges(): Promise<{
  repo: TestRepo;
  originalContent: string;
  modifiedContent: string;
}> {
  const repo = await setupRepoWithCommit(
    { 'file.txt': 'original content' },
    'Initial commit',
  );

  const originalContent = 'original content';
  const modifiedContent = 'modified content';

  await fs.writeFile(path.join(repo.dir, 'file.txt'), modifiedContent);
  await runGit(repo.dir, ['add', 'file.txt']);

  return { repo, originalContent, modifiedContent };
}

/**
 * Creates a repository with staged new files
 */
export async function setupRepoWithStagedNewFiles(): Promise<{
  repo: TestRepo;
  newFiles: Record<string, string>;
}> {
  const repo = await setupRepoWithCommit(
    { 'existing.txt': 'existing content' },
    'Initial commit',
  );

  const newFiles = {
    'newfile.txt': 'new content',
    'another.txt': 'another content',
  };

  for (const [filePath, content] of Object.entries(newFiles)) {
    await fs.writeFile(path.join(repo.dir, filePath), content);
  }
  await runGit(repo.dir, ['add', '.']);

  return { repo, newFiles };
}

/**
 * Creates a repository with untracked files
 */
export async function setupRepoWithUntracked(): Promise<{
  repo: TestRepo;
  untrackedFiles: string[];
}> {
  const repo = await setupRepoWithCommit(
    { 'tracked.txt': 'tracked content' },
    'Initial commit',
  );

  const untrackedFiles = ['untracked1.txt', 'untracked2.txt'];

  await fs.writeFile(
    path.join(repo.dir, 'untracked1.txt'),
    'untracked content 1',
  );
  await fs.writeFile(
    path.join(repo.dir, 'untracked2.txt'),
    'untracked content 2',
  );

  return { repo, untrackedFiles };
}

/**
 * Creates a repository with multiple commits
 */
export async function setupRepoWithMultipleCommits(
  commits: Array<{ files: Record<string, string>; message: string }>,
): Promise<TestRepo> {
  const repo = await createTestRepo();

  for (const { files, message } of commits) {
    await createCommit(repo, files, message);
  }

  return repo;
}

/**
 * Creates a reference repository and runs a git operation to get expected state
 * This is useful for comparing TSGIT behavior against canonical git
 */
export async function getGitReferenceState<T>(
  setupFn: () => Promise<TestRepo>,
  operation: (repo: TestRepo) => Promise<T>,
): Promise<T> {
  const tempRepo = await setupFn();
  try {
    return await operation(tempRepo);
  } finally {
    // Cleanup handled by test framework typically,
    // but we could add explicit cleanup here if needed
  }
}

/**
 * Creates a reference repository for reset operations and returns the expected index state
 */
export async function getReferenceResetState(
  scenario: 'staged-modifications' | 'staged-new-files' | 'missing-index',
): Promise<GitIndexEntry[]> {
  const repo = await createTestRepo();

  // Setup based on scenario
  switch (scenario) {
    case 'staged-modifications': {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.writeFile(path.join(repo.dir, 'file.txt'), 'modified');
      await runGit(repo.dir, ['add', 'file.txt']);
      break;
    }
    case 'staged-new-files': {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.writeFile(path.join(repo.dir, 'newfile.txt'), 'new content');
      await runGit(repo.dir, ['add', 'newfile.txt']);
      break;
    }
    case 'missing-index': {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.unlink(path.join(repo.gitdir, 'index'));
      break;
    }
  }

  // Run reset to get reference state
  await runGit(repo.dir, ['reset']);

  // Return the expected index state
  return await getGitIndexState(repo);
}

/**
 * Creates a reference repository for partial reset operations
 */
export async function getReferencePartialResetState(
  files: string[],
): Promise<GitIndexEntry[]> {
  const repo = await createTestRepo();

  await createCommit(
    repo,
    {
      'file1.txt': 'content1',
      'file2.txt': 'content2',
      'file3.txt': 'content3',
    },
    'Initial commit',
  );

  // Stage all files
  await fs.writeFile(path.join(repo.dir, 'file1.txt'), 'modified1');
  await fs.writeFile(path.join(repo.dir, 'file2.txt'), 'modified2');
  await fs.writeFile(path.join(repo.dir, 'file3.txt'), 'modified3');
  await runGit(repo.dir, ['add', '.']);

  // Run partial reset
  await runGit(repo.dir, ['reset', ...files]);

  return await getGitIndexState(repo);
}
