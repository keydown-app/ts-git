import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';

describe('MemoryFS', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  describe('readFile / writeFile', () => {
    it('should write and read a file', async () => {
      await fs.writeFile('/test.txt', 'hello world');
      const content = await fs.readFileString('/test.txt');
      expect(content).toBe('hello world');
    });

    it('should write binary data', async () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      await fs.writeFile('/binary.bin', data);
      const result = await fs.readFile('/binary.bin');
      expect(result).toEqual(data);
    });

    it('should create parent directories automatically', async () => {
      await fs.writeFile('/a/b/c/test.txt', 'nested');
      const content = await fs.readFileString('/a/b/c/test.txt');
      expect(content).toBe('nested');
    });

    it('should throw when reading non-existent file', async () => {
      await expect(fs.readFile('/nonexistent')).rejects.toThrow();
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      await fs.mkdir('/testdir');
      const stats = await fs.stat('/testdir');
      expect(stats.isDirectory).toBe(true);
    });

    it('should create directories recursively', async () => {
      await fs.mkdir('/a/b/c', { recursive: true });
      expect(await fs.exists('/a/b/c')).toBe(true);
    });

    it('should throw when directory already exists', async () => {
      await fs.mkdir('/testdir');
      await expect(fs.mkdir('/testdir')).rejects.toThrow();
    });
  });

  describe('readdir', () => {
    it('should list directory contents', async () => {
      await fs.writeFile('/file1.txt', 'content1');
      await fs.writeFile('/file2.txt', 'content2');
      await fs.mkdir('/subdir');

      const entries = await fs.readdir('/');
      const names = entries.map((e) => e.name).sort();

      expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);
    });
  });

  describe('stat', () => {
    it('should return file stats', async () => {
      await fs.writeFile('/test.txt', 'hello');
      const stats = await fs.stat('/test.txt');

      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBe(5);
    });

    it('should return directory stats', async () => {
      await fs.mkdir('/testdir');
      const stats = await fs.stat('/testdir');

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });
  });

  describe('exists', () => {
    it('should check if file exists', async () => {
      await fs.writeFile('/test.txt', 'content');

      expect(await fs.exists('/test.txt')).toBe(true);
      expect(await fs.exists('/nonexistent')).toBe(false);
    });
  });

  describe('unlink', () => {
    it('should delete a file', async () => {
      await fs.writeFile('/test.txt', 'content');
      await fs.unlink('/test.txt');

      expect(await fs.exists('/test.txt')).toBe(false);
    });

    it('should throw when deleting directory', async () => {
      await fs.mkdir('/testdir');
      await expect(fs.unlink('/testdir')).rejects.toThrow();
    });
  });

  describe('rmdir', () => {
    it('should delete an empty directory', async () => {
      await fs.mkdir('/testdir');
      await fs.rmdir('/testdir');

      expect(await fs.exists('/testdir')).toBe(false);
    });

    it('should delete directories recursively', async () => {
      await fs.mkdir('/a/b/c', { recursive: true });
      await fs.rmdir('/a', { recursive: true });

      expect(await fs.exists('/a')).toBe(false);
    });
  });

  describe('rename', () => {
    it('should rename a file', async () => {
      await fs.writeFile('/old.txt', 'content');
      await fs.rename('/old.txt', '/new.txt');

      expect(await fs.exists('/old.txt')).toBe(false);
      expect(await fs.exists('/new.txt')).toBe(true);
      expect(await fs.readFileString('/new.txt')).toBe('content');
    });
  });

  describe('copyFile', () => {
    it('should copy a file', async () => {
      await fs.writeFile('/source.txt', 'content');
      await fs.copyFile('/source.txt', '/dest.txt');

      expect(await fs.exists('/source.txt')).toBe(true);
      expect(await fs.exists('/dest.txt')).toBe(true);
      expect(await fs.readFileString('/dest.txt')).toBe('content');
    });
  });

  describe('clone', () => {
    it('should create an independent clone', async () => {
      await fs.writeFile('/test.txt', 'original');

      const cloned = fs.clone();
      await cloned.writeFile('/test.txt', 'modified');

      expect(await fs.readFileString('/test.txt')).toBe('original');
      expect(await cloned.readFileString('/test.txt')).toBe('modified');
    });
  });

  describe('reset', () => {
    it('should clear all files', async () => {
      await fs.writeFile('/test.txt', 'content');
      await fs.mkdir('/testdir');

      fs.reset();

      expect(await fs.exists('/test.txt')).toBe(false);
      expect(await fs.exists('/testdir')).toBe(false);
    });
  });
});
