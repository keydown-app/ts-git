import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import {
  parseIndex,
  serializeIndex,
  readIndex,
  writeIndex,
  createIndexEntry,
  updateIndexEntry,
  removeIndexEntry,
  findIndexEntry,
} from '../../core/index.js';

describe('index', () => {
  describe('parseIndex + serializeIndex', () => {
    it('should parse a valid index file', async () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 9,
            path: 'file.txt',
          },
        ],
      };

      const serialized = await serializeIndex(index);
      const parsed = parseIndex(serialized);

      expect(parsed.version).toBe(2);
      expect(parsed.entries.length).toBe(1);
      expect(parsed.entries[0].path.replace(/\0/g, '')).toBe('file.txt');
    });

    it('should handle empty index', async () => {
      const index = { version: 2, entries: [] };

      const serialized = await serializeIndex(index);
      const parsed = parseIndex(serialized);

      expect(parsed.version).toBe(2);
      expect(parsed.entries).toEqual([]);
    });

    it('should sort entries by path', async () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'z.txt',
          },
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'a.txt',
          },
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'm.txt',
          },
        ],
      };

      const serialized = await serializeIndex(index);
      const parsed = parseIndex(serialized);

      expect(parsed.entries[0].path).toBe('a.txt');
      expect(parsed.entries[1].path).toBe('m.txt');
      expect(parsed.entries[2].path).toBe('z.txt');
    });

    it('should preserve entry mode', async () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100755,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'script.sh',
          },
        ],
      };

      const serialized = await serializeIndex(index);
      const parsed = parseIndex(serialized);

      expect(parsed.entries[0].mode).toBe(0o100755);
    });

    it('should handle multiple entries', async () => {
      const index = {
        version: 3,
        entries: [
          {
            ctimeSeconds: 1,
            ctimeNanoseconds: 0,
            mtimeSeconds: 1,
            mtimeNanoseconds: 0,
            dev: 1,
            ino: 1,
            mode: 0o100644,
            uid: 1,
            gid: 1,
            size: 100,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'a.txt',
          },
          {
            ctimeSeconds: 2,
            ctimeNanoseconds: 0,
            mtimeSeconds: 2,
            mtimeNanoseconds: 0,
            dev: 2,
            ino: 2,
            mode: 0o100755,
            uid: 2,
            gid: 2,
            size: 200,
            oid: 'b'.repeat(40),
            flags: 5,
            path: 'b.sh',
          },
          {
            ctimeSeconds: 3,
            ctimeNanoseconds: 0,
            mtimeSeconds: 3,
            mtimeNanoseconds: 0,
            dev: 3,
            ino: 3,
            mode: 0o40000,
            uid: 3,
            gid: 3,
            size: 0,
            oid: 'c'.repeat(40),
            flags: 9,
            path: 'subdir',
          },
        ],
      };

      const serialized = await serializeIndex(index);
      const parsed = parseIndex(serialized);

      expect(parsed.entries.length).toBe(3);
      expect(parsed.entries[0].path.replace(/\0/g, '')).toBe('a.txt');
      expect(parsed.entries[1].path.replace(/\0/g, '')).toBe('b.sh');
      expect(parsed.entries[2].path.replace(/\0/g, '')).toBe('subdir');
    });

    it('should produce Git-compatible entry alignment (8-byte boundary)', async () => {
      // Test various path lengths to ensure proper padding
      // Git rounds (62 + pathLength) up to nearest multiple of 8
      const testCases = [
        { path: 'a', expectedEntrySize: 64 }, // 62 + 1 + 1 (NUL) = 64 -> 64
        { path: 'ab', expectedEntrySize: 72 }, // 62 + 2 + 1 (NUL) = 65 -> 72
        { path: 'abc', expectedEntrySize: 72 }, // 62 + 3 + 1 (NUL) = 66 -> 72
        { path: 'hello.txt', expectedEntrySize: 72 }, // 62 + 9 + 1 (NUL) = 72 -> 72
        { path: 'src/main.ts', expectedEntrySize: 80 }, // 62 + 11 + 1 (NUL) = 74 -> 80
      ];

      for (const tc of testCases) {
        const index = {
          version: 2,
          entries: [
            {
              ctimeSeconds: 0,
              ctimeNanoseconds: 0,
              mtimeSeconds: 0,
              mtimeNanoseconds: 0,
              dev: 0,
              ino: 0,
              mode: 0o100644,
              uid: 0,
              gid: 0,
              size: 0,
              oid: 'a'.repeat(40),
              flags: tc.path.length,
              path: tc.path,
            },
          ],
        };

        const serialized = await serializeIndex(index);
        // Header: 12 bytes, Entry: variable, Checksum: 20 bytes
        const expectedSize = 12 + tc.expectedEntrySize + 20;
        expect(serialized.length).toBe(expectedSize);

        // Verify the entry can be parsed back correctly
        const parsed = parseIndex(serialized);
        expect(parsed.entries[0].path).toBe(tc.path);
      }
    });

    it('should include valid SHA-1 checksum at the end', async () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 0,
            oid: 'a'.repeat(40),
            flags: 8,
            path: 'test.txt',
          },
        ],
      };

      const serialized = await serializeIndex(index);

      // Last 20 bytes should be the SHA-1 checksum
      const checksumStart = serialized.length - 20;
      const checksum = serialized.slice(checksumStart);

      // Checksum should be 20 bytes
      expect(checksum.length).toBe(20);

      // Checksum should not be all zeros (it should be a valid hash)
      const isAllZeros = checksum.every((b) => b === 0);
      expect(isAllZeros).toBe(false);
    });
  });

  describe('readIndex + writeIndex', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should write and read index', async () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 8,
            path: 'test.txt',
          },
        ],
      };

      await writeIndex(fs, '/repo/.git', index);
      const read = await readIndex(fs, '/repo/.git');

      expect(read.version).toBe(2);
      expect(read.entries.length).toBe(1);
      expect(read.entries[0].path.replace(/\0/g, '')).toBe('test.txt');
    });

    it('should return empty index for non-existent index file', async () => {
      const index = await readIndex(fs, '/repo/.git');

      expect(index.version).toBe(2);
      expect(index.entries).toEqual([]);
    });
  });

  describe('createIndexEntry', () => {
    it('should create index entry', () => {
      const entry = createIndexEntry({
        path: 'file.txt',
        oid: 'a'.repeat(40),
        mode: 0o100644,
        mtimeMs: 1000000,
        size: 100,
      });

      expect(entry.path).toBe('file.txt');
      expect(entry.oid).toBe('a'.repeat(40));
      expect(entry.mode).toBe(0o100644);
      expect(entry.size).toBe(100);
    });

    it('should set correct flags based on path length', () => {
      const shortEntry = createIndexEntry({
        path: 'a.txt',
        oid: 'a'.repeat(40),
        mode: 0o100644,
        mtimeMs: 1000,
        size: 10,
      });

      const longEntry = createIndexEntry({
        path: 'averylongfilename.txt',
        oid: 'a'.repeat(40),
        mode: 0o100644,
        mtimeMs: 1000,
        size: 10,
      });

      expect(shortEntry.flags & 0xfff).toBe(5);
      expect(longEntry.flags & 0xfff).toBe(21);
    });
  });

  describe('updateIndexEntry', () => {
    it('should update existing entry', () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'file.txt',
          },
        ],
      };

      const newEntry = {
        ctimeSeconds: 0,
        ctimeNanoseconds: 0,
        mtimeSeconds: 0,
        mtimeNanoseconds: 0,
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        size: 20,
        oid: 'b'.repeat(40),
        flags: 5,
        path: 'file.txt',
      };

      const updated = updateIndexEntry(index, newEntry);

      expect(updated.entries.length).toBe(1);
      expect(updated.entries[0].oid).toBe('b'.repeat(40));
      expect(updated.entries[0].size).toBe(20);
    });

    it('should add new entry if not exists', () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'file1.txt',
          },
        ],
      };

      const newEntry = {
        ctimeSeconds: 0,
        ctimeNanoseconds: 0,
        mtimeSeconds: 0,
        mtimeNanoseconds: 0,
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        size: 20,
        oid: 'b'.repeat(40),
        flags: 5,
        path: 'file2.txt',
      };

      const updated = updateIndexEntry(index, newEntry);

      expect(updated.entries.length).toBe(2);
    });
  });

  describe('removeIndexEntry', () => {
    it('should remove entry by path', () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'file1.txt',
          },
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 20,
            oid: 'b'.repeat(40),
            flags: 5,
            path: 'file2.txt',
          },
        ],
      };

      const removed = removeIndexEntry(index, 'file1.txt');

      expect(removed.entries.length).toBe(1);
      expect(removed.entries[0].path).toBe('file2.txt');
    });
  });

  describe('findIndexEntry', () => {
    it('should find entry by path', () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'file1.txt',
          },
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 20,
            oid: 'b'.repeat(40),
            flags: 5,
            path: 'file2.txt',
          },
        ],
      };

      const entry = findIndexEntry(index, 'file2.txt');

      expect(entry).toBeDefined();
      expect(entry!.oid).toBe('b'.repeat(40));
    });

    it('should return undefined for non-existent path', () => {
      const index = {
        version: 2,
        entries: [
          {
            ctimeSeconds: 0,
            ctimeNanoseconds: 0,
            mtimeSeconds: 0,
            mtimeNanoseconds: 0,
            dev: 0,
            ino: 0,
            mode: 0o100644,
            uid: 0,
            gid: 0,
            size: 10,
            oid: 'a'.repeat(40),
            flags: 5,
            path: 'file1.txt',
          },
        ],
      };

      const entry = findIndexEntry(index, 'nonexistent.txt');

      expect(entry).toBeUndefined();
    });
  });
});
