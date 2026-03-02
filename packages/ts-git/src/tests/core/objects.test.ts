import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import {
  serializeObject,
  deserializeObject,
  computeOid,
  objectToRaw,
  rawToObject,
  objectPath,
  readObject,
  writeObject,
  serializeBlob,
  deserializeBlob,
  serializeTree,
  deserializeTree,
  serializeCommit,
  deserializeCommit,
  parseObjectHeader,
} from '../../core/objects.js';

describe('objects', () => {
  describe('serializeObject + deserializeObject', () => {
    it('should serialize and deserialize a blob', () => {
      const content = new TextEncoder().encode('hello world');
      const serialized = serializeObject('blob', content);
      const deserialized = deserializeObject(serialized);

      expect(deserialized.type).toBe('blob');
      expect(new TextDecoder().decode(deserialized.content)).toBe(
        'hello world',
      );
    });

    it('should serialize and deserialize a commit', () => {
      const commitContent = serializeCommit({
        tree: 'a'.repeat(40),
        parent: [],
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        message: 'Test commit',
      });
      const serialized = serializeObject('commit', commitContent);
      const deserialized = deserializeObject(serialized);

      expect(deserialized.type).toBe('commit');
    });
  });

  describe('computeOid', () => {
    it('should compute OID for a blob', async () => {
      const content = new TextEncoder().encode('hello world');
      const oid = await computeOid('blob', content);
      expect(oid).toBeDefined();
      expect(oid).toHaveLength(40);
    });

    it('should compute consistent OIDs', async () => {
      const content = new TextEncoder().encode('test');
      const oid1 = await computeOid('blob', content);
      const oid2 = await computeOid('blob', content);
      expect(oid1).toBe(oid2);
    });

    it('should compute different OIDs for different content', async () => {
      const content1 = new TextEncoder().encode('hello');
      const content2 = new TextEncoder().encode('world');
      const oid1 = await computeOid('blob', content1);
      const oid2 = await computeOid('blob', content2);
      expect(oid1).not.toBe(oid2);
    });
  });

  describe('objectToRaw + rawToObject', () => {
    it('should compress and decompress object data', () => {
      const content = new TextEncoder().encode('test content');
      const raw = objectToRaw('blob', content);
      const decompressed = rawToObject(raw);

      expect(decompressed.type).toBe('blob');
      expect(new TextDecoder().decode(decompressed.content)).toBe(
        'test content',
      );
    });

    it('should produce different raw data than serialized', () => {
      const content = new TextEncoder().encode('test');
      const serialized = serializeObject('blob', content);
      const raw = objectToRaw('blob', content);

      expect(raw.length).not.toBe(serialized.length);
    });
  });

  describe('objectPath', () => {
    it('should generate correct object path', () => {
      const oid = '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed';
      const path = objectPath(oid, '/repo/.git');
      expect(path).toBe(
        '/repo/.git/objects/2a/ae6c35c94fcfb415dbe95f408b9ce91ee846ed',
      );
    });
  });

  describe('writeObject + readObject round-trip', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should write and read a blob', async () => {
      const content = new TextEncoder().encode('blob content');
      const oid = await writeObject(fs, '/repo/.git', 'blob', content);

      const result = await readObject(fs, '/repo/.git', oid);

      expect(result.type).toBe('blob');
      expect(result.oid).toBe(oid);
      expect(new TextDecoder().decode(result.content)).toBe('blob content');
    });

    it('should write and read a tree', async () => {
      const entries = [
        { mode: '100644', path: 'file.txt', oid: 'a'.repeat(40) },
      ];
      const content = serializeTree(entries);
      const oid = await writeObject(fs, '/repo/.git', 'tree', content);

      const result = await readObject(fs, '/repo/.git', oid);

      expect(result.type).toBe('tree');
      expect(result.oid).toBe(oid);
    });

    it('should throw error for non-existent object', async () => {
      await expect(
        readObject(fs, '/repo/.git', '0'.repeat(40)),
      ).rejects.toThrow();
    });
  });

  describe('serializeBlob + deserializeBlob', () => {
    it('should serialize a blob', () => {
      const content = new TextEncoder().encode('test');
      const serialized = serializeBlob(content);
      expect(serialized).toEqual(content);
    });

    it('should deserialize a blob', () => {
      const content = new TextEncoder().encode('test');
      const deserialized = deserializeBlob(content);
      expect(deserialized).toEqual(content);
    });
  });

  describe('serializeTree + deserializeTree', () => {
    it('should serialize and deserialize tree entries', () => {
      const entries = [
        { mode: '100644', path: 'file.txt', oid: 'a'.repeat(40) },
        { mode: '100755', path: 'script.sh', oid: 'b'.repeat(40) },
        { mode: '040000', path: 'subdir', oid: 'c'.repeat(40) },
      ];

      const serialized = serializeTree(entries);
      const deserialized = deserializeTree(serialized);

      expect(deserialized).toEqual(entries);
    });

    it('should handle empty tree', () => {
      const entries: { mode: string; path: string; oid: string }[] = [];
      const serialized = serializeTree(entries);
      const deserialized = deserializeTree(serialized);

      expect(deserialized).toEqual([]);
    });
  });

  describe('serializeCommit + deserializeCommit', () => {
    it('should serialize and deserialize a commit', () => {
      const commit = {
        tree: 'a'.repeat(40),
        parent: ['b'.repeat(40)],
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        message: 'Test commit message',
      };

      const serialized = serializeCommit(commit);
      const deserialized = deserializeCommit(serialized);

      expect(deserialized.tree).toBe(commit.tree);
      expect(deserialized.parent).toEqual(commit.parent);
      expect(deserialized.author.name).toBe(commit.author.name);
      expect(deserialized.author.email).toBe(commit.author.email);
      expect(deserialized.message).toBe(commit.message);
    });

    it('should handle commit without parents', () => {
      const commit = {
        tree: 'a'.repeat(40),
        parent: [],
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        message: 'Initial commit',
      };

      const serialized = serializeCommit(commit);
      const deserialized = deserializeCommit(serialized);

      expect(deserialized.parent).toEqual([]);
    });

    it('should handle commit with gpgsig', () => {
      const commit = {
        tree: 'a'.repeat(40),
        parent: [],
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1234567890,
          timezoneOffset: 0,
        },
        message: 'Signed commit',
        gpgsig: '-----BEGIN PGP SIGNATURE-----',
      };

      const serialized = serializeCommit(commit);
      const deserialized = deserializeCommit(serialized);

      expect(deserialized.gpgsig).toBe(commit.gpgsig);
    });
  });

  describe('parseObjectHeader', () => {
    it('should parse valid header', () => {
      const data = new TextEncoder().encode('blob 12\u0000hello world');
      const header = parseObjectHeader(data);

      expect(header).not.toBeNull();
      expect(header!.type).toBe('blob');
      expect(header!.size).toBe(12);
    });

    it('should return null for invalid header', () => {
      const data = new TextEncoder().encode('invalid');
      const header = parseObjectHeader(data);

      expect(header).toBeNull();
    });

    it('should return null for header without null byte', () => {
      const data = new TextEncoder().encode('blob 12');
      const header = parseObjectHeader(data);

      expect(header).toBeNull();
    });
  });
});
