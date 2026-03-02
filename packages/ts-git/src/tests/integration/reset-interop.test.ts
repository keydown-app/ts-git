import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createTestRepo,
  cleanupTempDir,
  runGit,
  createCommit,
  getGitIndexState,
  requireGit,
  type TestRepo,
} from './helpers.js';
import { reset } from '../../commands/reset.js';
import { readIndex } from '../../core/index.js';

beforeAll(async () => {
  await requireGit();
});

describe('Reset Command - Git CLI Interoperability', () => {
  describe('Full reset (no filepath)', () => {
    let repo: TestRepo;

    beforeEach(async () => {
      repo = await createTestRepo();
    });

    afterEach(async () => {
      await cleanupTempDir(repo.dir);
    });

    it('should produce same index state as git reset after staging modifications', async () => {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.writeFile(path.join(repo.dir, 'file.txt'), 'modified');
      await runGit(repo.dir, ['add', 'file.txt']);

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        { 'file.txt': 'version1' },
        'Initial commit',
      );
      await fs.writeFile(path.join(tempRepo.dir, 'file.txt'), 'modified');
      await runGit(tempRepo.dir, ['add', 'file.txt']);
      await runGit(tempRepo.dir, ['reset']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      await reset({ fs: repo.adapter, dir: repo.dir });
      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);

      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);
      expect(tsGitIndex.entries[0].path).toBe(gitIndexState[0].path);
      expect(tsGitIndex.entries[0].oid).toBe(gitIndexState[0].oid);
      expect(tsGitIndex.entries[0].mode.toString(8)).toBe(
        gitIndexState[0].mode,
      );
    });

    it('should produce same index state as git reset after adding new files', async () => {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.writeFile(path.join(repo.dir, 'newfile.txt'), 'new content');
      await runGit(repo.dir, ['add', 'newfile.txt']);

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        { 'file.txt': 'version1' },
        'Initial commit',
      );
      await fs.writeFile(path.join(tempRepo.dir, 'newfile.txt'), 'new content');
      await runGit(tempRepo.dir, ['add', 'newfile.txt']);
      await runGit(tempRepo.dir, ['reset']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      await reset({ fs: repo.adapter, dir: repo.dir });
      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);

      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);
      if (gitIndexState.length > 0) {
        expect(tsGitIndex.entries[0].path).toBe(gitIndexState[0].path);
        expect(tsGitIndex.entries[0].oid).toBe(gitIndexState[0].oid);
      }
    });

    it('should produce same index state when rebuilding from missing index', async () => {
      await createCommit(repo, { 'file.txt': 'version1' }, 'Initial commit');
      await fs.unlink(path.join(repo.gitdir, 'index'));

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        { 'file.txt': 'version1' },
        'Initial commit',
      );
      await fs.unlink(path.join(tempRepo.gitdir, 'index'));
      await runGit(tempRepo.dir, ['reset']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      await reset({ fs: repo.adapter, dir: repo.dir });
      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);

      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);
      if (gitIndexState.length > 0) {
        expect(tsGitIndex.entries[0].path).toBe(gitIndexState[0].path);
        expect(tsGitIndex.entries[0].oid).toBe(gitIndexState[0].oid);
        expect(tsGitIndex.entries[0].mode.toString(8)).toBe(
          gitIndexState[0].mode,
        );
      }
    });
  });

  describe('Partial reset (specific filepath)', () => {
    let repo: TestRepo;

    beforeEach(async () => {
      repo = await createTestRepo();
    });

    afterEach(async () => {
      await cleanupTempDir(repo.dir);
    });

    it('should unstage single file while preserving others', async () => {
      await createCommit(
        repo,
        { 'file1.txt': 'content1', 'file2.txt': 'content2' },
        'Initial commit',
      );
      await fs.writeFile(path.join(repo.dir, 'file1.txt'), 'modified1');
      await fs.writeFile(path.join(repo.dir, 'file2.txt'), 'modified2');
      await runGit(repo.dir, ['add', '.']);

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        { 'file1.txt': 'content1', 'file2.txt': 'content2' },
        'Initial commit',
      );
      await fs.writeFile(path.join(tempRepo.dir, 'file1.txt'), 'modified1');
      await fs.writeFile(path.join(tempRepo.dir, 'file2.txt'), 'modified2');
      await runGit(tempRepo.dir, ['add', '.']);
      await runGit(tempRepo.dir, ['reset', 'file1.txt']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      const result = await reset({
        fs: repo.adapter,
        dir: repo.dir,
        filepath: 'file1.txt',
      });
      expect(result.unstaged).toContain('file1.txt');

      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);
      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);

      const tsGitSorted = [...tsGitIndex.entries].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      const gitSorted = [...gitIndexState].sort((a, b) =>
        a.path.localeCompare(b.path),
      );

      for (let i = 0; i < tsGitSorted.length; i++) {
        expect(tsGitSorted[i].path).toBe(gitSorted[i].path);
        expect(tsGitSorted[i].oid).toBe(gitSorted[i].oid);
      }
    });

    it('should remove newly added file from index', async () => {
      await createCommit(repo, { 'file.txt': 'content' }, 'Initial commit');
      await fs.writeFile(path.join(repo.dir, 'newfile.txt'), 'new content');
      await runGit(repo.dir, ['add', 'newfile.txt']);

      const tempRepo = await createTestRepo();
      await createCommit(tempRepo, { 'file.txt': 'content' }, 'Initial commit');
      await fs.writeFile(path.join(tempRepo.dir, 'newfile.txt'), 'new content');
      await runGit(tempRepo.dir, ['add', 'newfile.txt']);
      await runGit(tempRepo.dir, ['reset', 'newfile.txt']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      const result = await reset({
        fs: repo.adapter,
        dir: repo.dir,
        filepath: 'newfile.txt',
      });
      expect(result.unstaged).toContain('newfile.txt');

      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);
      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);
      expect(tsGitIndex.entries[0].path).toBe('file.txt');
      expect(gitIndexState[0].path).toBe('file.txt');
    });

    it('should handle multiple files in array', async () => {
      await createCommit(
        repo,
        { 'file1.txt': 'c1', 'file2.txt': 'c2', 'file3.txt': 'c3' },
        'Initial commit',
      );
      await fs.writeFile(path.join(repo.dir, 'file1.txt'), 'm1');
      await fs.writeFile(path.join(repo.dir, 'file2.txt'), 'm2');
      await fs.writeFile(path.join(repo.dir, 'file3.txt'), 'm3');
      await runGit(repo.dir, ['add', '.']);

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        { 'file1.txt': 'c1', 'file2.txt': 'c2', 'file3.txt': 'c3' },
        'Initial commit',
      );
      await fs.writeFile(path.join(tempRepo.dir, 'file1.txt'), 'm1');
      await fs.writeFile(path.join(tempRepo.dir, 'file2.txt'), 'm2');
      await fs.writeFile(path.join(tempRepo.dir, 'file3.txt'), 'm3');
      await runGit(tempRepo.dir, ['add', '.']);
      await runGit(tempRepo.dir, ['reset', 'file1.txt', 'file3.txt']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      const result = await reset({
        fs: repo.adapter,
        dir: repo.dir,
        filepath: ['file1.txt', 'file3.txt'],
      });
      expect(result.unstaged).toContain('file1.txt');
      expect(result.unstaged).toContain('file3.txt');
      expect(result.unstaged).not.toContain('file2.txt');

      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);
      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);

      const tsGitPaths = tsGitIndex.entries.map((e) => e.path).sort();
      const gitPaths = gitIndexState.map((e) => e.path).sort();
      expect(tsGitPaths).toEqual(gitPaths);
    });
  });

  describe('Nested paths', () => {
    let repo: TestRepo;

    beforeEach(async () => {
      repo = await createTestRepo();
    });

    afterEach(async () => {
      await cleanupTempDir(repo.dir);
    });

    it('should handle nested directory paths', async () => {
      await createCommit(
        repo,
        {
          'src/main.ts': 'console.log("main")',
          'src/utils/helper.ts': 'export const help = () => {}',
        },
        'Initial commit',
      );

      await fs.writeFile(
        path.join(repo.dir, 'src/utils/helper.ts'),
        'export const help = () => "updated"',
      );
      await runGit(repo.dir, ['add', '.']);

      const tempRepo = await createTestRepo();
      await createCommit(
        tempRepo,
        {
          'src/main.ts': 'console.log("main")',
          'src/utils/helper.ts': 'export const help = () => {}',
        },
        'Initial commit',
      );
      await fs.writeFile(
        path.join(tempRepo.dir, 'src/utils/helper.ts'),
        'export const help = () => "updated"',
      );
      await runGit(tempRepo.dir, ['add', '.']);
      await runGit(tempRepo.dir, ['reset', 'src/utils/helper.ts']);
      const gitIndexState = await getGitIndexState(tempRepo);
      await cleanupTempDir(tempRepo.dir);

      const result = await reset({
        fs: repo.adapter,
        dir: repo.dir,
        filepath: 'src/utils/helper.ts',
      });
      expect(result.unstaged).toContain('src/utils/helper.ts');

      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);
      expect(tsGitIndex.entries).toHaveLength(gitIndexState.length);

      const tsGitPaths = tsGitIndex.entries.map((e) => e.path).sort();
      const gitPaths = gitIndexState.map((e) => e.path).sort();
      expect(tsGitPaths).toEqual(gitPaths);
    });
  });

  describe('Index file compatibility', () => {
    let repo: TestRepo;

    beforeEach(async () => {
      repo = await createTestRepo();
    });

    afterEach(async () => {
      await cleanupTempDir(repo.dir);
    });

    it('should produce index that git can parse without errors', async () => {
      await createCommit(
        repo,
        {
          'file1.txt': 'content1',
          'file2.txt': 'content2',
          'file3.txt': 'content3',
        },
        'Initial commit',
      );

      await fs.unlink(path.join(repo.gitdir, 'index'));
      await reset({ fs: repo.adapter, dir: repo.dir });

      await expect(runGit(repo.dir, ['ls-files', '-s'])).resolves.not.toThrow();
      await expect(runGit(repo.dir, ['status'])).resolves.not.toThrow();
    });

    it('should preserve correct flags for various path lengths', async () => {
      const files: Record<string, string> = {
        a: 'content a',
        ab: 'content ab',
        'file.txt': 'content file',
        'longfilename.txt': 'content long',
        'very/long/path/to/file.txt': 'content nested',
      };

      await createCommit(repo, files, 'Initial commit');
      await fs.unlink(path.join(repo.gitdir, 'index'));
      await reset({ fs: repo.adapter, dir: repo.dir });

      const tsGitIndex = await readIndex(repo.adapter, repo.gitdir);

      for (const entry of tsGitIndex.entries) {
        const pathLength = entry.path.length;
        const flagsPathLength = entry.flags & 0xfff;
        expect(flagsPathLength).toBe(pathLength);
      }

      await expect(runGit(repo.dir, ['ls-files', '-s'])).resolves.not.toThrow();
    });
  });
});
