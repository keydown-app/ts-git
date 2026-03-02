import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';
import { add, addAll } from '../../commands/add.js';
import { readIndex } from '../../core/index.js';
import { readObject } from '../../core/objects.js';

describe('add', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should add a file to the index', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'hello world');

    const result = await add({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result.added).toContain('file.txt');

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'file.txt');
    expect(entry).toBeDefined();
    expect(entry!.oid).toBeDefined();
  });

  it('should add multiple files', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file1.txt', 'content1');
    await fs.writeFile('/repo/file2.txt', 'content2');

    const result = await add({
      fs,
      dir: '/repo',
      filepath: ['file1.txt', 'file2.txt'],
    });

    expect(result.added).toHaveLength(2);

    const index = await readIndex(fs, '/repo/.git');
    expect(index.entries).toHaveLength(2);
  });

  it('should update existing index entry', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'original');

    await add({ fs, dir: '/repo', filepath: 'file.txt' });

    await fs.writeFile('/repo/file.txt', 'modified');

    const result = await add({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result.updated).toContain('file.txt');

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'file.txt');
    expect(entry).toBeDefined();
  });

  it('should write blob objects', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/test.txt', 'test content');

    await add({ fs, dir: '/repo', filepath: 'test.txt' });

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'test.txt');

    const { content } = await readObject(fs, '/repo/.git', entry!.oid);
    const text = new TextDecoder().decode(content);
    expect(text).toBe('test content');
  });

  it('should handle nested paths', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/subdir', { recursive: true });
    await fs.writeFile('/repo/subdir/nested.txt', 'nested content');

    await add({ fs, dir: '/repo', filepath: 'subdir/nested.txt' });

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'subdir/nested.txt');
    expect(entry).toBeDefined();
  });

  it('should add all files in directory recursively', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/subdir', { recursive: true });
    await fs.writeFile('/repo/subdir/file1.txt', 'content1');
    await fs.writeFile('/repo/subdir/file2.txt', 'content2');

    const result = await add({ fs, dir: '/repo', filepath: 'subdir' });

    expect(result.added).toContain('subdir/file1.txt');
    expect(result.added).toContain('subdir/file2.txt');

    const index = await readIndex(fs, '/repo/.git');
    expect(index.entries).toHaveLength(2);
  });

  it('should recursively add files in nested directories', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/dir1/dir2', { recursive: true });
    await fs.writeFile('/repo/dir1/file1.txt', 'content1');
    await fs.writeFile('/repo/dir1/dir2/file2.txt', 'content2');

    const result = await add({ fs, dir: '/repo', filepath: 'dir1' });

    expect(result.added).toContain('dir1/file1.txt');
    expect(result.added).toContain('dir1/dir2/file2.txt');

    const index = await readIndex(fs, '/repo/.git');
    expect(index.entries).toHaveLength(2);
  });

  it('should skip .git directory when adding recursively', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/src', { recursive: true });
    await fs.writeFile('/repo/src/main.js', 'console.log("hello")');

    // Create a .git directory inside the src folder (unusual but test it)
    await fs.mkdir('/repo/src/.git', { recursive: true });
    await fs.writeFile('/repo/src/.git/config', 'test');

    const result = await add({ fs, dir: '/repo', filepath: 'src' });

    expect(result.added).toContain('src/main.js');
    expect(result.added).not.toContain('src/.git/config');

    const index = await readIndex(fs, '/repo/.git');
    const paths = index.entries.map((e) => e.path);
    expect(paths).toContain('src/main.js');
    expect(paths).not.toContain('src/.git/config');
  });
});

describe('addAll', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should add all new files', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file1.txt', 'content1');
    await fs.writeFile('/repo/file2.txt', 'content2');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toHaveLength(2);
    expect(result.added).toContain('file1.txt');
    expect(result.added).toContain('file2.txt');

    const index = await readIndex(fs, '/repo/.git');
    expect(index.entries).toHaveLength(2);
  });

  it('should add modified files', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });

    await fs.writeFile('/repo/file.txt', 'modified');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.updated).toContain('file.txt');

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'file.txt');
    expect(entry).toBeDefined();
  });

  it('should not add unmodified files', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('should return empty result when no files to add', async () => {
    await init({ fs, dir: '/repo' });

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('should handle nested directories', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/subdir', { recursive: true });
    await fs.writeFile('/repo/subdir/nested.txt', 'nested content');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toContain('subdir/nested.txt');

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'subdir/nested.txt');
    expect(entry).toBeDefined();
  });

  it('should handle deleted files by removing them from index', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });

    await fs.unlink('/repo/file.txt');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);

    const index = await readIndex(fs, '/repo/.git');
    const entry = index.entries.find((e) => e.path === 'file.txt');
    expect(entry).toBeUndefined();
  });

  it('should handle mixed changes (new, modified, and deleted)', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/existing.txt', 'original');
    await fs.writeFile('/repo/to-delete.txt', 'to be deleted');
    await add({
      fs,
      dir: '/repo',
      filepath: ['existing.txt', 'to-delete.txt'],
    });

    // Modify existing file
    await fs.writeFile('/repo/existing.txt', 'modified');
    // Add new file
    await fs.writeFile('/repo/new.txt', 'new content');
    // Delete file
    await fs.unlink('/repo/to-delete.txt');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.updated).toContain('existing.txt');
    expect(result.added).toContain('new.txt');

    const index = await readIndex(fs, '/repo/.git');
    const paths = index.entries.map((e) => e.path);
    expect(paths).toContain('existing.txt');
    expect(paths).toContain('new.txt');
    expect(paths).not.toContain('to-delete.txt');
  });

  it('should not stage files in .git directory', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');

    const result = await addAll({ fs, dir: '/repo' });

    expect(result.added).toHaveLength(1);
    expect(result.added).toContain('file.txt');

    const index = await readIndex(fs, '/repo/.git');
    const paths = index.entries.map((e) => e.path);
    expect(paths).not.toContain('.git/config');
    expect(paths).not.toContain('.git/HEAD');
    expect(paths).not.toContain('.git/index');
    expect(paths).not.toContain(
      '.git/objects/3e/f6b023da5bc0b1013bb34351ccca49faa71e44',
    );
    expect(paths).toContain('file.txt');
  });

  it('should not stage .git/index or .git/objects/* files when using addAll', async () => {
    await init({ fs, dir: '/repo' });

    // Create a file and add it to generate objects
    await fs.writeFile('/repo/test.md', 'test content');
    await add({ fs, dir: '/repo', filepath: 'test.md' });

    // Now use addAll and ensure .git files are not staged
    await fs.writeFile('/repo/another.txt', 'another content');

    const result = await addAll({ fs, dir: '/repo' });

    // Should only add the new file, not any .git files
    expect(result.added).toHaveLength(1);
    expect(result.added).toContain('another.txt');

    const index = await readIndex(fs, '/repo/.git');
    const paths = index.entries.map((e) => e.path);

    // Ensure no .git files are in the index
    const gitFiles = paths.filter((p) => p.startsWith('.git/'));
    expect(gitFiles).toHaveLength(0);

    // Regular files should be there
    expect(paths).toContain('test.md');
    expect(paths).toContain('another.txt');
  });

  it('should not stage files in custom gitdir when using addAll', async () => {
    // Initialize with a custom gitdir
    await init({ fs, dir: '/repo', gitdir: '/repo/.custom-git' });
    await fs.writeFile('/repo/file.txt', 'content');

    const result = await addAll({
      fs,
      dir: '/repo',
      gitdir: '/repo/.custom-git',
    });

    expect(result.added).toHaveLength(1);
    expect(result.added).toContain('file.txt');

    const index = await readIndex(fs, '/repo/.custom-git');
    const paths = index.entries.map((e) => e.path);

    // Ensure no files from the custom gitdir are in the index
    expect(paths).not.toContain('.custom-git/config');
    expect(paths).not.toContain('.custom-git/HEAD');
    expect(paths).not.toContain('.custom-git/index');
    expect(paths).toContain('file.txt');
  });
});
