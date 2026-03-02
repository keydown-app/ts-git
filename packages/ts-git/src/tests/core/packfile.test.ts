import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { readObject, writeObject } from '../../core/objects.js';
import {
  readObjectFromPackfile,
  hasObjectInPackfile,
  invalidatePackCache,
} from '../../core/packfile.js';

describe('packfile', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  describe('hasObjectInPackfile', () => {
    it('should return false when no pack files exist', async () => {
      const result = await hasObjectInPackfile(
        fs,
        '/repo/.git',
        'a'.repeat(40),
      );
      expect(result).toBe(false);
    });

    it('should return false when object is not in pack file', async () => {
      await fs.mkdir('/repo/.git/objects/pack', { recursive: true });

      const result = await hasObjectInPackfile(
        fs,
        '/repo/.git',
        'a'.repeat(40),
      );
      expect(result).toBe(false);
    });
  });

  describe('readObjectFromPackfile', () => {
    it('should return null when no pack files exist', async () => {
      const result = await readObjectFromPackfile(
        fs,
        '/repo/.git',
        'a'.repeat(40),
      );
      expect(result).toBeNull();
    });

    it('should return null when object is not in pack file', async () => {
      await fs.mkdir('/repo/.git/objects/pack', { recursive: true });

      const result = await readObjectFromPackfile(
        fs,
        '/repo/.git',
        'a'.repeat(40),
      );
      expect(result).toBeNull();
    });
  });

  describe('invalidatePackCache', () => {
    it('should not throw when cache is empty', () => {
      expect(() => invalidatePackCache(fs)).not.toThrow();
    });
  });
});

describe('readObject with packfile fallback', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should read loose object when it exists', async () => {
    await fs.mkdir('/repo/.git/objects/ab', { recursive: true });

    const content = new TextEncoder().encode('Hello, World!');
    const oid = await writeObject(fs as any, '/repo/.git', 'blob', content);

    const result = await readObject(fs as any, '/repo/.git', oid);

    expect(result).not.toBeNull();
    expect(result.type).toBe('blob');
    expect(result.content).toEqual(content);
  });

  it('should fallback to packfile when loose object does not exist', async () => {
    await fs.mkdir('/repo/.git/objects/pack', { recursive: true });

    await writeObject(
      fs as any,
      '/repo/.git',
      'blob',
      new TextEncoder().encode('test content'),
    );

    const result = await readObject(
      fs as any,
      '/repo/.git',
      'nonexistent0000000000000000000000000000',
    ).catch((e) => e);

    expect(result).toBeInstanceOf(Error);
  });
});
