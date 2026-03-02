import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';
import { add } from '../../commands/add.js';
import { commit } from '../../commands/commit.js';
import { status, statusMatrix } from '../../commands/status.js';
import { NotAGitRepoError } from '../../errors.js';

describe('status', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should throw NotAGitRepoError when not in a git repository', async () => {
    await fs.writeFile('/not-a-repo/file.txt', 'content');

    await expect(
      status({ fs, dir: '/not-a-repo', filepath: 'file.txt' }),
    ).rejects.toThrow(NotAGitRepoError);
  });

  it('should return *added for untracked file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/newfile.txt', 'content');

    const result = await status({ fs, dir: '/repo', filepath: 'newfile.txt' });

    expect(result).toBe('*added');
  });

  it('should return unmodified for committed file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const result = await status({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result).toBe('unmodified');
  });

  it('should return *modified for staged then modified file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/file.txt', 'modified');

    const result = await status({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result).toBe('*modified');
  });

  it('should return modified for staged changes', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/file.txt', 'modified');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });

    const result = await status({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result).toBe('modified');
  });

  it('should return deleted for removed file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.unlink('/repo/file.txt');

    const result = await status({ fs, dir: '/repo', filepath: 'file.txt' });

    expect(result).toBe('*deleted');
  });
});

describe('statusMatrix', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should throw NotAGitRepoError when not in a git repository', async () => {
    await fs.writeFile('/not-a-repo/file.txt', 'content');

    await expect(statusMatrix({ fs, dir: '/not-a-repo' })).rejects.toThrow(
      NotAGitRepoError,
    );
  });

  it('should return matrix for all files', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file1.txt', 'content1');
    await fs.writeFile('/repo/file2.txt', 'content2');
    await add({ fs, dir: '/repo', filepath: ['file1.txt', 'file2.txt'] });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/file3.txt', 'new content');

    const matrix = await statusMatrix({ fs, dir: '/repo' });

    expect(matrix.length).toBeGreaterThan(0);
  });

  it('should return correct matrix values for modified file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/file.txt', 'modified');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['file.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('file.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(2);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for added file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/newfile.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'newfile.txt' });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['newfile.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('newfile.txt');
    expect(head).toBe(0);
    expect(workdir).toBe(2);
    expect(stage).toBe(2);
  });

  it('should return correct matrix values for deleted file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.unlink('/repo/file.txt');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['file.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('file.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(0);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for unmodified file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['file.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('file.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(1);
    expect(stage).toBe(1);
  });

  it('should filter files using filepaths parameter', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file1.txt', 'content1');
    await fs.writeFile('/repo/file2.txt', 'content2');
    await fs.writeFile('/repo/file3.txt', 'content3');
    await add({
      fs,
      dir: '/repo',
      filepath: ['file1.txt', 'file2.txt', 'file3.txt'],
    });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['file1.txt', 'file2.txt'],
    });

    expect(matrix.length).toBe(2);
    expect(matrix.map((r) => r[0])).toContain('file1.txt');
    expect(matrix.map((r) => r[0])).toContain('file2.txt');
    expect(matrix.map((r) => r[0])).not.toContain('file3.txt');
  });

  it('should filter files using filter function', async () => {
    await init({ fs, dir: '/repo' });
    await fs.writeFile('/repo/file1.txt', 'content1');
    await fs.writeFile('/repo/file2.md', 'content2');
    await add({ fs, dir: '/repo', filepath: ['file1.txt', 'file2.md'] });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['file1.txt', 'file2.md'],
      filter: (filepath) => filepath.endsWith('.txt'),
    });

    expect(matrix.length).toBe(1);
    expect(matrix[0][0]).toBe('file1.txt');
  });

  it('should handle multiple files with different statuses', async () => {
    await init({ fs, dir: '/repo' });

    await fs.writeFile('/repo/committed.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'committed.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/committed.txt', 'modified');
    await fs.writeFile('/repo/added.txt', 'new');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['committed.txt', 'added.txt'],
    });

    expect(matrix.length).toBe(2);

    const committedRow = matrix.find((r) => r[0] === 'committed.txt');
    expect(committedRow).toBeDefined();
    expect(committedRow![1]).toBe(1);
    expect(committedRow![2]).toBe(2);

    const addedRow = matrix.find((r) => r[0] === 'added.txt');
    expect(addedRow).toBeDefined();
    expect(addedRow![1]).toBe(0);
    expect(addedRow![2]).toBe(2);
  });
});

describe('statusMatrix - nested paths', () => {
  let fs: MemoryFS;

  beforeEach(() => {
    fs = new MemoryFS();
  });

  it('should return correct matrix values for committed nested file (unmodified)', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.writeFile('/repo/testdir/test.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['testdir/test.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('testdir/test.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(1);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for committed nested file modified in workdir', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.writeFile('/repo/testdir/test.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/testdir/test.txt', 'modified');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['testdir/test.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('testdir/test.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(2);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for committed nested file staged and modified', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.writeFile('/repo/testdir/test.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/testdir/test.txt', 'modified');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await fs.writeFile('/repo/testdir/test.txt', 'modified again');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['testdir/test.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('testdir/test.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(2);
    expect(stage).toBe(3);
  });

  it('should return correct matrix values for committed nested file deleted', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.writeFile('/repo/testdir/test.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.unlink('/repo/testdir/test.txt');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['testdir/test.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('testdir/test.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(0);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for multi-level nested committed file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/a/b/c', { recursive: true });
    await fs.writeFile('/repo/a/b/c/file.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'a/b/c/file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['a/b/c/file.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('a/b/c/file.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(1);
    expect(stage).toBe(1);
  });

  it('should return correct matrix values for multi-level nested modified file', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/a/b/c', { recursive: true });
    await fs.writeFile('/repo/a/b/c/file.txt', 'original');
    await add({ fs, dir: '/repo', filepath: 'a/b/c/file.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/a/b/c/file.txt', 'modified');

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['a/b/c/file.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('a/b/c/file.txt');
    expect(head).toBe(1);
    expect(workdir).toBe(2);
    expect(stage).toBe(1);
  });

  it('should return correct status for committed nested file with staged deletion', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.writeFile('/repo/testdir/test.txt', 'content');
    await add({ fs, dir: '/repo', filepath: 'testdir/test.txt' });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.unlink('/repo/testdir/test.txt');
    // Stage the deletion using remove command
    const { remove } = await import('../../commands/add.js');
    await remove({ fs, dir: '/repo', filepath: 'testdir/test.txt' });

    const matrix = await statusMatrix({
      fs,
      dir: '/repo',
      filepaths: ['testdir/test.txt'],
    });

    expect(matrix.length).toBe(1);
    const [filepath, head, workdir, stage] = matrix[0];
    expect(filepath).toBe('testdir/test.txt');
    expect(head).toBe(1); // File exists in HEAD
    expect(workdir).toBe(0); // File deleted from workdir
    expect(stage).toBe(0); // File removed from index (staged deletion)
  });

  it('should handle multiple nested files with different statuses', async () => {
    await init({ fs, dir: '/repo' });
    await fs.mkdir('/repo/testdir', { recursive: true });
    await fs.mkdir('/repo/anotherdir', { recursive: true });

    await fs.writeFile('/repo/testdir/committed.txt', 'original');
    await fs.writeFile('/repo/anotherdir/file.txt', 'original');
    await add({
      fs,
      dir: '/repo',
      filepath: ['testdir/committed.txt', 'anotherdir/file.txt'],
    });
    await commit({
      fs,
      dir: '/repo',
      message: 'Initial commit',
      author: { name: 'Test', email: 'test@example.com' },
    });

    await fs.writeFile('/repo/testdir/committed.txt', 'modified');
    await fs.writeFile('/repo/testdir/newfile.txt', 'new');

    const matrix = await statusMatrix({ fs, dir: '/repo' });

    const committedRow = matrix.find((r) => r[0] === 'testdir/committed.txt');
    expect(committedRow).toBeDefined();
    expect(committedRow![1]).toBe(1);
    expect(committedRow![2]).toBe(2);

    const newFileRow = matrix.find((r) => r[0] === 'testdir/newfile.txt');
    expect(newFileRow).toBeDefined();
    expect(newFileRow![1]).toBe(0);
    expect(newFileRow![2]).toBe(2);

    const unchangedRow = matrix.find((r) => r[0] === 'anotherdir/file.txt');
    expect(unchangedRow).toBeDefined();
    expect(unchangedRow![1]).toBe(1);
    expect(unchangedRow![2]).toBe(1);
  });
});

describe('classifyStatusRow', () => {
  it('should classify clean tracked file', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Clean: head=1, workdir=1, stage=1
    const result = classifyStatusRow(['file.txt', 1, 1, 1]);
    expect(result.isClean).toBe(true);
    expect(result.isStaged).toBe(false);
    expect(result.isUnstaged).toBe(false);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe(' ');
    expect(result.unstagedStatus).toBe(' ');
  });

  it('should classify untracked file', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Untracked: head=0, workdir=2, stage=0
    const result = classifyStatusRow(['newfile.txt', 0, 2, 0]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(false);
    expect(result.isUnstaged).toBe(false);
    expect(result.isUntracked).toBe(true);
    expect(result.stagedStatus).toBe(' ');
    expect(result.unstagedStatus).toBe('?');
  });

  it('should classify staged addition', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Staged addition: head=0, workdir=2, stage=2
    const result = classifyStatusRow(['newfile.txt', 0, 2, 2]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(true);
    expect(result.isUnstaged).toBe(false);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe('A');
    expect(result.unstagedStatus).toBe(' ');
  });

  it('should classify unstaged modification', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Unstaged modification: head=1, workdir=2, stage=1
    const result = classifyStatusRow(['modified.txt', 1, 2, 1]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(false);
    expect(result.isUnstaged).toBe(true);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe(' ');
    expect(result.unstagedStatus).toBe('M');
  });

  it('should classify staged modification with further unstaged changes', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Staged + unstaged: head=1, workdir=2, stage=3
    const result = classifyStatusRow(['both.txt', 1, 2, 3]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(true);
    expect(result.isUnstaged).toBe(true);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe('M');
    expect(result.unstagedStatus).toBe('M');
  });

  it('should classify staged new file with further unstaged changes', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Staged new file + further edits: head=0, workdir=2, stage=3
    const result = classifyStatusRow(['newfile.txt', 0, 2, 3]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(true);
    expect(result.isUnstaged).toBe(true);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe('A');
    expect(result.unstagedStatus).toBe('M');
  });

  it('should classify staged deletion', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Staged deletion: head=1, workdir=0, stage=2
    const result = classifyStatusRow(['deleted.txt', 1, 0, 2]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(true);
    expect(result.isUnstaged).toBe(false);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe('D');
    expect(result.unstagedStatus).toBe(' ');
  });

  it('should classify unstaged deletion', async () => {
    const { classifyStatusRow } = await import('../../commands/status.js');
    // Unstaged deletion: head=1, workdir=0, stage=1
    const result = classifyStatusRow(['deleted.txt', 1, 0, 1]);
    expect(result.isClean).toBe(false);
    expect(result.isStaged).toBe(false);
    expect(result.isUnstaged).toBe(true);
    expect(result.isUntracked).toBe(false);
    expect(result.stagedStatus).toBe(' ');
    expect(result.unstagedStatus).toBe('D');
  });
});
