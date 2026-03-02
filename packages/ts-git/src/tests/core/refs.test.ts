import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import {
  readRef,
  writeRef,
  resolveHead,
  isSymbolicRef,
  parseSymbolicRef,
  formatSymbolicRef,
  resolveRef,
  isValidRefName,
  refPath,
  getCurrentBranch,
  listBranches,
  listTags,
  isHeadDetached,
  setHead,
  setHeadDetached,
  deleteRef,
  invalidatePackedRefsCache,
} from '../../core/refs.js';
import { InvalidRefError } from '../../errors.js';

describe('refs', () => {
  describe('isSymbolicRef', () => {
    it('should return true for symbolic ref', () => {
      expect(isSymbolicRef('ref: refs/heads/main')).toBe(true);
    });

    it('should return false for direct oid', () => {
      expect(isSymbolicRef('a'.repeat(40))).toBe(false);
    });
  });

  describe('parseSymbolicRef', () => {
    it('should parse symbolic ref', () => {
      const result = parseSymbolicRef('ref: refs/heads/main');
      expect(result).toBe('refs/heads/main');
    });

    it('should return null for non-symbolic ref', () => {
      const result = parseSymbolicRef('a'.repeat(40));
      expect(result).toBeNull();
    });

    it('should handle whitespace', () => {
      const result = parseSymbolicRef('  ref: refs/heads/main  ');
      expect(result).toBe('refs/heads/main');
    });
  });

  describe('formatSymbolicRef', () => {
    it('should format symbolic ref', () => {
      const result = formatSymbolicRef('refs/heads/main');
      expect(result).toBe('ref: refs/heads/main');
    });
  });

  describe('resolveRef', () => {
    it('should resolve symbolic ref', () => {
      const result = resolveRef('ref: refs/heads/main');
      expect(result).toBe('refs/heads/main');
    });

    it('should return same value for direct ref', () => {
      const result = resolveRef('refs/heads/main');
      expect(result).toBe('refs/heads/main');
    });
  });

  describe('isValidRefName', () => {
    it('should accept valid ref names', () => {
      expect(isValidRefName('main')).toBe(true);
      expect(isValidRefName('feature/test')).toBe(true);
      expect(isValidRefName('heads/main')).toBe(true);
    });

    it('should reject invalid ref names', () => {
      expect(isValidRefName('.')).toBe(false);
      expect(isValidRefName('..')).toBe(false);
      expect(isValidRefName('/')).toBe(false);
      expect(isValidRefName('a/b/')).toBe(false);
      expect(isValidRefName('a/./b')).toBe(false);
      expect(isValidRefName('a/../b')).toBe(false);
      expect(isValidRefName('/starts')).toBe(false);
    });
  });

  describe('refPath', () => {
    it('should generate path for simple ref', () => {
      const path = refPath('main', '/repo/.git');
      expect(path).toBe('/repo/.git/refs/heads/main');
    });

    it('should generate path for refs/ prefix', () => {
      const path = refPath('refs/heads/main', '/repo/.git');
      expect(path).toBe('/repo/.git/refs/heads/main');
    });

    it('should generate path for HEAD', () => {
      const path = refPath('HEAD', '/repo/.git');
      expect(path).toBe('/repo/.git/HEAD');
    });
  });

  describe('writeRef + readRef', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should write and read a ref', async () => {
      await writeRef(fs, '/repo/.git', 'main', 'a'.repeat(40));
      const result = await readRef(fs, '/repo/.git', 'main');

      expect(result).toBe('a'.repeat(40));
    });

    it('should write and read symbolic ref', async () => {
      await writeRef(fs, '/repo/.git', 'HEAD', 'ref: refs/heads/main');
      const result = await readRef(fs, '/repo/.git', 'HEAD');

      expect(result).toBe('ref: refs/heads/main');
    });

    it('should return null for non-existent ref', async () => {
      const result = await readRef(fs, '/repo/.git', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should handle ref with newline', async () => {
      await writeRef(fs, '/repo/.git', 'main', 'a'.repeat(40) + '\n');
      const result = await readRef(fs, '/repo/.git', 'main');

      expect(result).toBe('a'.repeat(40));
    });

    it('should throw error for invalid ref name', async () => {
      await expect(
        writeRef(fs, '/repo/.git', '.', 'a'.repeat(40)),
      ).rejects.toThrow(InvalidRefError);
    });

    it('should throw error when ref exists and force is false', async () => {
      await writeRef(fs, '/repo/.git', 'main', 'a'.repeat(40));
      await expect(
        writeRef(fs, '/repo/.git', 'main', 'b'.repeat(40)),
      ).rejects.toThrow(InvalidRefError);
    });

    it('should overwrite ref when force is true', async () => {
      await writeRef(fs, '/repo/.git', 'main', 'a'.repeat(40));
      await writeRef(fs, '/repo/.git', 'main', 'b'.repeat(40), true);
      const result = await readRef(fs, '/repo/.git', 'main');

      expect(result).toBe('b'.repeat(40));
    });
  });

  describe('resolveHead', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should resolve symbolic ref to branch', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/HEAD', 'ref: refs/heads/main');
      await fs.writeFile('/repo/.git/refs/heads/main', 'a'.repeat(40));

      const result = await resolveHead(fs, '/repo/.git');

      expect(result).not.toBeNull();
      if (result && result.type === 'symbolic') {
        expect(result.ref).toBe('refs/heads/main');
      } else {
        throw new Error('Expected symbolic ref');
      }
    });

    it('should resolve detached HEAD', async () => {
      await fs.writeFile('/repo/.git/HEAD', 'a'.repeat(40));

      const result = await resolveHead(fs, '/repo/.git');

      expect(result).not.toBeNull();
      if (result && result.type === 'commit') {
        expect(result.oid).toBe('a'.repeat(40));
      } else {
        throw new Error('Expected commit');
      }
    });

    it('should return null for non-existent HEAD', async () => {
      const result = await resolveHead(fs, '/repo/.git');

      expect(result).toBeNull();
    });
  });

  describe('getCurrentBranch', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should get current branch name', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/HEAD', 'ref: refs/heads/main');
      await fs.writeFile('/repo/.git/refs/heads/main', 'a'.repeat(40));

      const result = await getCurrentBranch(fs, '/repo/.git');

      expect(result).toBe('main');
    });

    it('should return null for detached HEAD', async () => {
      await fs.writeFile('/repo/.git/HEAD', 'a'.repeat(40));

      const result = await getCurrentBranch(fs, '/repo/.git');

      expect(result).toBeNull();
    });
  });

  describe('listBranches', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should list all branches', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/refs/heads/feature/a', 'a'.repeat(40));
      await fs.writeFile('/repo/.git/refs/heads/feature/b', 'b'.repeat(40));
      await fs.writeFile('/repo/.git/refs/heads/main', 'c'.repeat(40));

      const result = await listBranches(fs, '/repo/.git');

      expect(result).toEqual(['feature/a', 'feature/b', 'main']);
    });

    it('should return empty array when no branches', async () => {
      const result = await listBranches(fs, '/repo/.git');

      expect(result).toEqual([]);
    });
  });

  describe('isHeadDetached', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should return false for symbolic HEAD', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/HEAD', 'ref: refs/heads/main');

      const result = await isHeadDetached(fs, '/repo/.git');

      expect(result).toBe(false);
    });

    it('should return true for detached HEAD', async () => {
      await fs.writeFile('/repo/.git/HEAD', 'a'.repeat(40));

      const result = await isHeadDetached(fs, '/repo/.git');

      expect(result).toBe(true);
    });
  });

  describe('setHead + setHeadDetached', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should set HEAD to symbolic ref', async () => {
      await setHead(fs, '/repo/.git', 'refs/heads/main');

      const content = await fs.readFileString('/repo/.git/HEAD');
      expect(content.trim()).toBe('ref: refs/heads/main');
    });

    it('should set HEAD to detached commit', async () => {
      await setHeadDetached(fs, '/repo/.git', 'a'.repeat(40));

      const content = await fs.readFileString('/repo/.git/HEAD');
      expect(content.trim()).toBe('a'.repeat(40));
    });
  });

  describe('deleteRef', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
    });

    it('should delete a ref', async () => {
      await writeRef(fs, '/repo/.git', 'main', 'a'.repeat(40));
      await deleteRef(fs, '/repo/.git', 'main');

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBeNull();
    });
  });

  describe('packed refs', () => {
    let fs: MemoryFS;

    beforeEach(() => {
      fs = new MemoryFS();
      invalidatePackedRefsCache('/repo/.git');
    });

    it('should read ref from packed-refs file', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        '# pack-refs with: fully\n' +
          'a'.repeat(40) +
          ' refs/heads/main\n' +
          'b'.repeat(40) +
          ' refs/heads/feature\n',
      );

      const result = await readRef(fs, '/repo/.git', 'refs/heads/main');
      expect(result).toBe('a'.repeat(40));
    });

    it('should prefer loose ref over packed ref', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/refs/heads/main', 'c'.repeat(40));
      await fs.writeFile(
        '/repo/.git/packed-refs',
        'a'.repeat(40) + ' refs/heads/main\n',
      );

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBe('c'.repeat(40));
    });

    it('should fallback to packed ref when loose ref does not exist', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        'a'.repeat(40) + ' refs/heads/main\n',
      );

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBe('a'.repeat(40));
    });

    it('should list branches from both loose and packed refs', async () => {
      await fs.mkdir('/repo/.git/refs/heads', { recursive: true });
      await fs.writeFile('/repo/.git/refs/heads/main', 'a'.repeat(40));
      await fs.writeFile(
        '/repo/.git/packed-refs',
        'b'.repeat(40) +
          ' refs/heads/feature\n' +
          'c'.repeat(40) +
          ' refs/heads/develop\n',
      );

      const result = await listBranches(fs, '/repo/.git');
      expect(result).toContain('main');
      expect(result).toContain('feature');
      expect(result).toContain('develop');
    });

    it('should list tags from packed refs', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        'a'.repeat(40) +
          ' refs/tags/v1.0.0\n' +
          'b'.repeat(40) +
          ' refs/tags/v1.1.0\n',
      );

      const result = await listTags(fs, '/repo/.git');
      expect(result).toContain('v1.0.0');
      expect(result).toContain('v1.1.0');
    });

    it('should ignore lines starting with # or ^ in packed-refs', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        '# pack-refs with: fully\n' +
          '^' +
          'c'.repeat(40) +
          '\n' +
          'a'.repeat(40) +
          ' refs/heads/main\n',
      );

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBe('a'.repeat(40));
    });

    it('should invalidate packed refs cache when writing a ref', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        'a'.repeat(40) + ' refs/heads/main\n',
      );

      invalidatePackedRefsCache('/repo/.git');
      await writeRef(fs, '/repo/.git', 'main', 'b'.repeat(40), true);

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBe('b'.repeat(40));
    });

    it('should handle empty packed-refs file', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile('/repo/.git/packed-refs', '');

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBeNull();
    });

    it('should handle packed-refs file with only comments', async () => {
      await fs.mkdir('/repo/.git', { recursive: true });
      await fs.writeFile(
        '/repo/.git/packed-refs',
        '# comment\n# another comment\n',
      );

      const result = await readRef(fs, '/repo/.git', 'main');
      expect(result).toBeNull();
    });
  });
});
