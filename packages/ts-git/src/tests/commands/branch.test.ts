import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';
import { add } from '../../commands/add.js';
import { commit } from '../../commands/commit.js';
import {
  branch,
  listBranchesCommand,
  deleteBranch,
  checkoutBranch,
} from '../../commands/branch.js';
import { readRef } from '../../core/refs.js';
import {
  AlreadyExistsError,
  NotFoundError,
  InvalidRefError,
} from '../../errors.js';

describe('branch', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  async function createCommit(repo: string, filename: string, content: string) {
    await fs.writeFile(`/${repo}/${filename}`, content);
    await add({ fs, dir: `/${repo}`, filepath: filename });
    return commit({
      fs,
      dir: `/${repo}`,
      message: `Add ${filename}`,
      author: { name: 'Test', email: 'test@example.com' },
    });
  }

  describe('branch creation', () => {
    it('should create a branch from current HEAD', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');

      const oid = await branch({ fs, dir: '/repo', ref: 'feature' });

      const ref = await readRef(fs, '/repo/.git', 'refs/heads/feature');
      expect(ref).toBe(oid);
      expect(ref).toHaveLength(40);
    });

    it('should create a branch and checkout', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');

      await branch({ fs, dir: '/repo', ref: 'feature', checkout: true });

      const head = await fs.readFileString('/repo/.git/HEAD');
      expect(head.trim()).toBe('ref: refs/heads/feature');
    });

    it('should create a branch at specific commit', async () => {
      await init({ fs, dir: '/repo' });
      const firstOid = await createCommit('repo', 'file1.txt', 'content1');
      await createCommit('repo', 'file2.txt', 'content2');

      await branch({ fs, dir: '/repo', ref: 'at-first', object: firstOid });

      const ref = await readRef(fs, '/repo/.git', 'refs/heads/at-first');
      expect(ref).toBe(firstOid);
    });

    it('should force overwrite existing branch', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });

      const secondOid = await createCommit('repo', 'file2.txt', 'content2');

      await branch({
        fs,
        dir: '/repo',
        ref: 'feature',
        object: secondOid,
        force: true,
      });

      const ref = await readRef(fs, '/repo/.git', 'refs/heads/feature');
      expect(ref).toBe(secondOid);
    });

    it('should throw AlreadyExistsError when branch exists without force', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });

      await expect(
        branch({ fs, dir: '/repo', ref: 'feature' }),
      ).rejects.toThrow(AlreadyExistsError);
    });

    it('should throw InvalidRefError when HEAD is not pointing to a commit', async () => {
      await init({ fs, dir: '/repo' });

      await expect(
        branch({ fs, dir: '/repo', ref: 'feature' }),
      ).rejects.toThrow(InvalidRefError);
    });

    it('should create branch from symbolic ref HEAD', async () => {
      await init({ fs, dir: '/repo' });
      const oid = await createCommit('repo', 'file.txt', 'content');

      await branch({ fs, dir: '/repo', ref: 'feature' });

      const ref = await readRef(fs, '/repo/.git', 'refs/heads/feature');
      expect(ref).toBe(oid);
    });
  });

  describe('listBranchesCommand', () => {
    it('should list all branches and current branch', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });
      await branch({ fs, dir: '/repo', ref: 'develop' });

      const result = await listBranchesCommand({ fs, dir: '/repo' });

      expect(result.branches).toContain('master');
      expect(result.branches).toContain('feature');
      expect(result.branches).toContain('develop');
      expect(result.current).toBe('master');
    });

    it('should return current branch after checkout', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature', checkout: true });

      const result = await listBranchesCommand({ fs, dir: '/repo' });

      expect(result.current).toBe('feature');
    });

    it('should return null current when in detached HEAD', async () => {
      await init({ fs, dir: '/repo' });
      const oid = await createCommit('repo', 'file.txt', 'content');
      await fs.writeFile('/repo/.git/HEAD', oid);

      const result = await listBranchesCommand({ fs, dir: '/repo' });

      expect(result.current).toBeNull();
    });
  });

  describe('deleteBranch', () => {
    it('should delete a merged branch', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });

      // feature is merged into master since it was created from master
      await deleteBranch({ fs, dir: '/repo', ref: 'feature' });

      const result = await listBranchesCommand({ fs, dir: '/repo' });
      expect(result.branches).not.toContain('feature');
    });

    it('should throw error when deleting current branch', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');

      await expect(
        deleteBranch({ fs, dir: '/repo', ref: 'master' }),
      ).rejects.toThrow(InvalidRefError);
    });

    it('should throw NotFoundError when branch does not exist', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');

      await expect(
        deleteBranch({ fs, dir: '/repo', ref: 'nonexistent' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should delete merged branch after checking out another', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });
      await branch({ fs, dir: '/repo', ref: 'develop', checkout: true });

      await deleteBranch({ fs, dir: '/repo', ref: 'feature' });

      const result = await listBranchesCommand({ fs, dir: '/repo' });
      expect(result.branches).not.toContain('feature');
      expect(result.branches).toContain('develop');
      expect(result.current).toBe('develop');
    });

    it('should refuse to delete unmerged branch without force', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content1');
      await branch({ fs, dir: '/repo', ref: 'feature', checkout: true });
      await createCommit('repo', 'feature.txt', 'feature content');
      // Switch back to master using checkoutBranch
      await checkoutBranch({ fs, dir: '/repo', ref: 'master' });

      // feature branch has commits not in master
      await expect(
        deleteBranch({ fs, dir: '/repo', ref: 'feature' }),
      ).rejects.toThrow(InvalidRefError);
    });

    it('should allow deleting unmerged branch with force', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content1');
      await branch({ fs, dir: '/repo', ref: 'feature', checkout: true });
      await createCommit('repo', 'feature.txt', 'feature content');
      // Switch back to master using checkoutBranch
      await checkoutBranch({ fs, dir: '/repo', ref: 'master' });

      // Should succeed with force
      await deleteBranch({ fs, dir: '/repo', ref: 'feature', force: true });

      const result = await listBranchesCommand({ fs, dir: '/repo' });
      expect(result.branches).not.toContain('feature');
    });

    it('should work with custom gitdir', async () => {
      await init({ fs, dir: '/repo', gitdir: '/repo/custom-git' });
      // Create commit manually with custom gitdir
      await fs.writeFile('/repo/file.txt', 'content');
      await add({
        fs,
        dir: '/repo',
        filepath: 'file.txt',
        gitdir: '/repo/custom-git',
      });
      await commit({
        fs,
        dir: '/repo',
        gitdir: '/repo/custom-git',
        message: 'Add file.txt',
        author: { name: 'Test', email: 'test@example.com' },
      });
      await branch({
        fs,
        dir: '/repo',
        ref: 'feature',
        gitdir: '/repo/custom-git',
      });

      await deleteBranch({
        fs,
        dir: '/repo',
        ref: 'feature',
        gitdir: '/repo/custom-git',
      });

      const { listBranches: listBranchesFn } =
        await import('../../core/refs.js');
      const branches = await listBranchesFn(fs, '/repo/custom-git');
      expect(branches).not.toContain('feature');
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout an existing branch', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });

      await checkoutBranch({ fs, dir: '/repo', ref: 'feature' });

      const head = await fs.readFileString('/repo/.git/HEAD');
      expect(head.trim()).toBe('ref: refs/heads/feature');
    });

    it('should throw NotFoundError when branch does not exist', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');

      await expect(
        checkoutBranch({ fs, dir: '/repo', ref: 'nonexistent' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should switch between branches', async () => {
      await init({ fs, dir: '/repo' });
      await createCommit('repo', 'file.txt', 'content');
      await branch({ fs, dir: '/repo', ref: 'feature' });
      await branch({ fs, dir: '/repo', ref: 'develop' });

      await checkoutBranch({ fs, dir: '/repo', ref: 'feature' });
      let head = await fs.readFileString('/repo/.git/HEAD');
      expect(head.trim()).toBe('ref: refs/heads/feature');

      await checkoutBranch({ fs, dir: '/repo', ref: 'develop' });
      head = await fs.readFileString('/repo/.git/HEAD');
      expect(head.trim()).toBe('ref: refs/heads/develop');
    });
  });
});
