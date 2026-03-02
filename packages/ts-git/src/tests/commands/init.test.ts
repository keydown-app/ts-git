import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';

describe('init', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should initialize a standard repository', async () => {
    await init({ fs, dir: '/myproject' });

    expect(await fs.exists('/myproject/.git')).toBe(true);
    expect(await fs.exists('/myproject/.git/HEAD')).toBe(true);
    expect(await fs.exists('/myproject/.git/config')).toBe(true);
    expect(await fs.exists('/myproject/.git/refs/heads')).toBe(true);
    expect(await fs.exists('/myproject/.git/objects/info')).toBe(true);
  });

  it('should initialize with custom gitdir', async () => {
    await init({ fs, dir: '/project', gitdir: '/custom/.ts-git' });

    expect(await fs.exists('/project/.git')).toBe(false);
    expect(await fs.exists('/custom/.ts-git')).toBe(true);
    expect(await fs.exists('/custom/.ts-git/HEAD')).toBe(true);
  });

  it('should throw error for relative gitdir', async () => {
    await expect(
      init({ fs, dir: '/project', gitdir: '.ts-git' }),
    ).rejects.toThrow('gitdir must be an absolute path');
  });

  it('should create default branch ref', async () => {
    await init({ fs, dir: '/repo', defaultBranch: 'develop' });

    const head = await fs.readFileString('/repo/.git/HEAD');
    expect(head.trim()).toBe('ref: refs/heads/develop');
  });

  it('should create empty index', async () => {
    await init({ fs, dir: '/repo' });

    expect(await fs.exists('/repo/.git/index')).toBe(true);
    const index = await fs.readFile('/repo/.git/index');
    expect(index.length).toBeGreaterThan(0);
  });

  it('should re-initialize existing repo without error', async () => {
    await init({ fs, dir: '/repo' });

    await init({ fs, dir: '/repo' });

    expect(await fs.exists('/repo/.git/HEAD')).toBe(true);
    expect(await fs.exists('/repo/.git/refs/heads')).toBe(true);
  });

  it('should initialize in current directory', async () => {
    await init({ fs, dir: '/current' });

    expect(await fs.exists('/current/.git/HEAD')).toBe(true);
  });
});
