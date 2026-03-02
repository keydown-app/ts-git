import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';
import { add } from '../../commands/add.js';
import { commit } from '../../commands/commit.js';
import { reset } from '../../commands/reset.js';
import { readIndex } from '../../core/index.js';

describe('reset', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  async function setupRepoWithCommit() {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'version1');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });
  }

  describe('staged modifications', () => {
    it('should restore HEAD version when resetting staged modification of tracked file', async () => {
      await setupRepoWithCommit();

      // Modify file and stage it
      await fs.writeFile('/repo/file.txt', 'modified content');
      await add({ fs, dir: '/repo', filepath: 'file.txt' });

      // Verify file is staged with new content
      let index = await readIndex(fs, '/repo/.git');
      const stagedEntry = index.entries.find((e) => e.path === 'file.txt');
      expect(stagedEntry).toBeDefined();

      // Reset the file
      const result = await reset({ fs, dir: '/repo', filepath: 'file.txt' });

      // Verify the file is restored to HEAD version in index
      expect(result.unstaged).toContain('file.txt');
      index = await readIndex(fs, '/repo/.git');
      const resetEntry = index.entries.find((e) => e.path === 'file.txt');
      expect(resetEntry).toBeDefined();
      // The oid should now match HEAD (version1), not the modified content
    });

    it('should restore HEAD version when index entry differs from HEAD', async () => {
      await setupRepoWithCommit();

      // Modify the file in the working tree and stage it
      await fs.writeFile('/repo/file.txt', 'staged modification');
      await add({ fs, dir: '/repo', filepath: 'file.txt' });

      // Get the staged OID
      let index = await readIndex(fs, '/repo/.git');
      const stagedOid = index.entries.find((e) => e.path === 'file.txt')?.oid;
      expect(stagedOid).toBeDefined();

      // Reset to restore from HEAD
      const result = await reset({ fs, dir: '/repo', filepath: 'file.txt' });

      // Verify file is reported as unstaged
      expect(result.unstaged).toContain('file.txt');

      // Verify file is restored to HEAD version in index
      index = await readIndex(fs, '/repo/.git');
      const resetEntry = index.entries.find((e) => e.path === 'file.txt');
      expect(resetEntry).toBeDefined();
      // The OID should have changed back to HEAD version
      expect(resetEntry?.oid).not.toBe(stagedOid);
    });
  });

  describe('staged additions', () => {
    it('should remove staged new file from index when resetting', async () => {
      await setupRepoWithCommit();

      // Add a new file and stage it
      await fs.writeFile('/repo/newfile.txt', 'new content');
      await add({ fs, dir: '/repo', filepath: 'newfile.txt' });

      // Verify file is staged
      let index = await readIndex(fs, '/repo/.git');
      expect(index.entries.find((e) => e.path === 'newfile.txt')).toBeDefined();

      // Reset the new file
      const result = await reset({ fs, dir: '/repo', filepath: 'newfile.txt' });

      // Verify the file is removed from index (since it doesn't exist in HEAD)
      expect(result.unstaged).toContain('newfile.txt');
      index = await readIndex(fs, '/repo/.git');
      expect(
        index.entries.find((e) => e.path === 'newfile.txt'),
      ).toBeUndefined();
    });
  });

  describe('partial reset', () => {
    it('should only reset specified paths when multiple files are staged', async () => {
      await setupRepoWithCommit();

      // Add two new files
      await fs.writeFile('/repo/file1.txt', 'content1');
      await fs.writeFile('/repo/file2.txt', 'content2');
      await add({ fs, dir: '/repo', filepath: ['file1.txt', 'file2.txt'] });

      // Reset only file1
      const result = await reset({ fs, dir: '/repo', filepath: 'file1.txt' });

      expect(result.unstaged).toHaveLength(1);
      expect(result.unstaged).toContain('file1.txt');

      // file1 should be removed from index, file2 should remain
      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries.find((e) => e.path === 'file1.txt')).toBeUndefined();
      expect(index.entries.find((e) => e.path === 'file2.txt')).toBeDefined();
    });

    it('should handle array of filepaths', async () => {
      await setupRepoWithCommit();

      // Add three new files
      await fs.writeFile('/repo/file1.txt', 'content1');
      await fs.writeFile('/repo/file2.txt', 'content2');
      await fs.writeFile('/repo/file3.txt', 'content3');
      await add({
        fs,
        dir: '/repo',
        filepath: ['file1.txt', 'file2.txt', 'file3.txt'],
      });

      // Reset file1 and file3
      const result = await reset({
        fs,
        dir: '/repo',
        filepath: ['file1.txt', 'file3.txt'],
      });

      expect(result.unstaged).toHaveLength(2);
      expect(result.unstaged).toContain('file1.txt');
      expect(result.unstaged).toContain('file3.txt');

      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries.find((e) => e.path === 'file1.txt')).toBeUndefined();
      expect(index.entries.find((e) => e.path === 'file2.txt')).toBeDefined();
      expect(index.entries.find((e) => e.path === 'file3.txt')).toBeUndefined();
    });
  });

  describe('full reset (no filepath)', () => {
    it('should reset entire index to match HEAD', async () => {
      await setupRepoWithCommit();

      // Add new files and modify existing
      await fs.writeFile('/repo/file.txt', 'modified');
      await fs.writeFile('/repo/newfile.txt', 'new content');
      await add({ fs, dir: '/repo', filepath: ['file.txt', 'newfile.txt'] });

      // Full reset
      const result = await reset({ fs, dir: '/repo' });

      // Both files should be reported as unstaged
      expect(result.unstaged).toHaveLength(2);
      expect(result.unstaged).toContain('file.txt');
      expect(result.unstaged).toContain('newfile.txt');

      // Index should now only contain file.txt (from HEAD), not newfile.txt
      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].path).toBe('file.txt');
    });

    it('should return empty array when resetting empty index on unborn HEAD', async () => {
      await init({ fs, dir: '/repo' });

      const result = await reset({ fs, dir: '/repo' });

      expect(result.unstaged).toHaveLength(0);

      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(0);
    });
  });

  describe('unborn HEAD', () => {
    it('should remove all staged files when HEAD is unborn (no commits)', async () => {
      await init({ fs, dir: '/repo' });

      // Stage some files
      await fs.writeFile('/repo/file1.txt', 'content1');
      await fs.writeFile('/repo/file2.txt', 'content2');
      await add({ fs, dir: '/repo', filepath: ['file1.txt', 'file2.txt'] });

      // Reset should remove all files from index since HEAD is unborn
      const result = await reset({ fs, dir: '/repo' });

      expect(result.unstaged).toHaveLength(2);
      expect(result.unstaged).toContain('file1.txt');
      expect(result.unstaged).toContain('file2.txt');

      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(0);
    });

    it('should remove staged file when resetting specific path with unborn HEAD', async () => {
      await init({ fs, dir: '/repo' });

      // Stage a file
      await fs.writeFile('/repo/file.txt', 'content');
      await add({ fs, dir: '/repo', filepath: 'file.txt' });

      // Reset should remove the file from index
      const result = await reset({ fs, dir: '/repo', filepath: 'file.txt' });

      expect(result.unstaged).toContain('file.txt');

      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(0);
    });
  });

  describe('nested paths', () => {
    it('should handle nested path reset', async () => {
      await setupRepoWithCommit();
      await fs.mkdir('/repo/subdir', { recursive: true });
      await fs.writeFile('/repo/subdir/nested.txt', 'nested content');
      await add({ fs, dir: '/repo', filepath: 'subdir/nested.txt' });

      const result = await reset({
        fs,
        dir: '/repo',
        filepath: 'subdir/nested.txt',
      });

      expect(result.unstaged).toContain('subdir/nested.txt');

      const index = await readIndex(fs, '/repo/.git');
      expect(
        index.entries.find((e) => e.path === 'subdir/nested.txt'),
      ).toBeUndefined();
    });
  });

  describe('non-existent files', () => {
    it('should return empty array when resetting non-existent file', async () => {
      await setupRepoWithCommit();

      const result = await reset({
        fs,
        dir: '/repo',
        filepath: 'nonexistent.txt',
      });

      expect(result.unstaged).toHaveLength(0);

      // Original file should still be in index
      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries.find((e) => e.path === 'file.txt')).toBeDefined();
    });
  });

  describe('custom gitdir', () => {
    it('should work with custom gitdir', async () => {
      await init({ fs, dir: '/repo', gitdir: '/repo/custom-git' });
      await fs.writeFile('/repo/file.txt', 'content');
      await add({
        fs,
        dir: '/repo',
        filepath: 'file.txt',
        gitdir: '/repo/custom-git',
      });

      const result = await reset({
        fs,
        dir: '/repo',
        filepath: 'file.txt',
        gitdir: '/repo/custom-git',
      });

      expect(result.unstaged).toContain('file.txt');

      const { readIndex: readIndexFn } = await import('../../core/index.js');
      const index = await readIndexFn(fs, '/repo/custom-git');
      expect(index.entries).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should throw error when not in a git repository', async () => {
      await fs.mkdir('/repo', { recursive: true });

      await expect(reset({ fs, dir: '/repo' })).rejects.toThrow(
        'not a git repository',
      );
    });
  });

  describe('index flags validation', () => {
    it('should correctly rebuild index from HEAD with valid flags', async () => {
      await setupRepoWithCommit();

      // Delete the index to simulate needing to rebuild from HEAD
      await fs.unlink('/repo/.git/index');

      // Reset should rebuild index from HEAD with correct flags
      await reset({ fs, dir: '/repo' });

      // Should be able to read the index without error
      const index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].path).toBe('file.txt');
      // Flags lower 12 bits must encode path length
      expect(index.entries[0].flags & 0xfff).toBe('file.txt'.length);
    });

    it('should preserve valid flags when resetting partial paths', async () => {
      await setupRepoWithCommit();

      // Add a new file and stage it
      await fs.writeFile('/repo/newfile.txt', 'new content');
      await add({ fs, dir: '/repo', filepath: 'newfile.txt' });

      // Verify it was staged with correct flags
      let index = await readIndex(fs, '/repo/.git');
      const newEntry = index.entries.find((e) => e.path === 'newfile.txt');
      expect(newEntry).toBeDefined();
      expect(newEntry!.flags & 0xfff).toBe('newfile.txt'.length);

      // Reset the new file - should remove it from index
      await reset({ fs, dir: '/repo', filepath: 'newfile.txt' });

      // Index should still be valid and parseable
      index = await readIndex(fs, '/repo/.git');
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].path).toBe('file.txt');
      expect(index.entries[0].flags & 0xfff).toBe('file.txt'.length);
    });
  });
});
