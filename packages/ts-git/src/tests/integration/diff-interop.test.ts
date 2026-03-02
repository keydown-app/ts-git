import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { NodeFSAdapter } from '../../fs/node-adapter.js';
import { diff, formatNameStatus } from '../../commands/diff/index.js';
import { commandParser, type CommandContext } from '../../cli/commandParser.js';
import { GitClient } from '../../client/index.js';
import {
  createTempDir,
  cleanupTempDir,
  runGit,
  requireGit,
} from './helpers.js';
import type { LineDiffAlgorithm } from '../../types.js';

const execFileAsync = promisify(execFile);

const myersLineDiff: LineDiffAlgorithm = (oldLines, newLines) => {
  const edits: {
    type: '+' | '-' | ' ';
    oldIndex: number;
    newIndex: number;
    content: string;
  }[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (
    oldIdx < oldLines.length &&
    newIdx < newLines.length &&
    oldLines[oldIdx] === newLines[newIdx]
  ) {
    edits.push({
      type: ' ',
      oldIndex: oldIdx,
      newIndex: newIdx,
      content: oldLines[oldIdx],
    });
    oldIdx++;
    newIdx++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  const endEdits: typeof edits = [];

  while (
    oldEnd > oldIdx &&
    newEnd > newIdx &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    endEdits.unshift({
      type: ' ',
      oldIndex: oldEnd,
      newIndex: newEnd,
      content: oldLines[oldEnd],
    });
    oldEnd--;
    newEnd--;
  }

  for (let i = oldIdx; i <= oldEnd; i++) {
    edits.push({ type: '-', oldIndex: i, newIndex: -1, content: oldLines[i] });
  }
  for (let i = newIdx; i <= newEnd; i++) {
    edits.push({ type: '+', oldIndex: -1, newIndex: i, content: newLines[i] });
  }

  return [...edits, ...endEdits];
};

function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function normalizeDiffPatchForCompare(patch: string): string {
  return stripAnsiCodes(patch)
    .trimEnd()
    .split('\n')
    .filter((line) => {
      if (line === '-' || line === '+') return false;
      return true;
    })
    .map((line) => {
      if (line.startsWith('index ')) return 'index <normalized>';
      if (line.startsWith('@@')) return '@@ <hunk> @@';
      return line;
    })
    .join('\n');
}

describe('diff vs git name-status and patch', () => {
  beforeAll(async () => {
    await requireGit();
  });

  it('matches git diff --name-status and git diff --cached --name-status (symbolic HEAD)', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);

      await fs.writeFile(path.join(tempDir, 'wd.txt'), 'worktree\n');
      await runGit(tempDir, ['add', 'wd.txt']);
      await runGit(tempDir, ['commit', '-m', 'add wd']);

      await fs.writeFile(path.join(tempDir, 'wd.txt'), 'changed\n');
      await fs.writeFile(path.join(tempDir, 'staged_only.txt'), 'staged\n');
      await runGit(tempDir, ['add', 'staged_only.txt']);

      const adapter = new NodeFSAdapter(tempDir);

      const { stdout: gitWorktreeOut } = await execFileAsync(
        'git',
        ['diff', '--name-status'],
        {
          cwd: tempDir,
          encoding: 'utf8',
        },
      );
      const gitWorktree = gitWorktreeOut
        .split('\n')
        .map((l: string) => l.trimEnd())
        .filter(Boolean)
        .sort();

      const rWorktree = await diff({
        fs: adapter,
        dir: tempDir,
        lineDiffAlgorithm: myersLineDiff,
      });
      expect(
        formatNameStatus(rWorktree).split('\n').filter(Boolean).sort(),
      ).toEqual(gitWorktree);

      const { stdout: gitCachedOut } = await execFileAsync(
        'git',
        ['diff', '--cached', '--name-status'],
        {
          cwd: tempDir,
          encoding: 'utf8',
        },
      );
      const gitCached = gitCachedOut
        .split('\n')
        .map((l: string) => l.trimEnd())
        .filter(Boolean)
        .sort();

      const rCached = await diff({
        fs: adapter,
        dir: tempDir,
        cached: true,
        lineDiffAlgorithm: myersLineDiff,
      });
      expect(
        formatNameStatus(rCached).split('\n').filter(Boolean).sort(),
      ).toEqual(gitCached);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('CommandParser diff --name-status matches git diff --name-status', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);
      await fs.writeFile(path.join(tempDir, 'f.txt'), 'a\n');
      await runGit(tempDir, ['add', 'f.txt']);
      await runGit(tempDir, ['commit', '-m', 'c']);
      await fs.writeFile(path.join(tempDir, 'f.txt'), 'b\n');

      const adapter = new NodeFSAdapter(tempDir);
      const gitClient = new GitClient({
        fs: adapter,
        dir: tempDir,
        gitdir: path.join(tempDir, '.git'),
        lineDiffAlgorithm: myersLineDiff,
      });
      const ctx: CommandContext = {
        currentDir: '/',
        fs: adapter,
        git: gitClient,
        author: { name: 't', email: 't@t' },
      };

      const parsed = await commandParser.execute('diff --name-status', ctx);
      expect(parsed.success).toBe(true);

      const { stdout: gitOut } = await execFileAsync(
        'git',
        ['diff', '--name-status'],
        {
          cwd: tempDir,
          encoding: 'utf8',
        },
      );
      const gitLines = gitOut
        .split('\n')
        .map((l: string) => l.trimEnd())
        .filter(Boolean)
        .sort();

      const ours = parsed.output.split('\n').filter(Boolean).sort();
      expect(ours).toEqual(gitLines);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('CommandParser diff (patch) matches git diff after worktree change', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);
      await fs.writeFile(path.join(tempDir, 'track.txt'), 'line1\n');
      await runGit(tempDir, ['add', 'track.txt']);
      await runGit(tempDir, ['commit', '-m', 'c']);
      await fs.writeFile(path.join(tempDir, 'track.txt'), 'line1\nchanged\n');

      const adapter = new NodeFSAdapter(tempDir);
      const gitClient = new GitClient({
        fs: adapter,
        dir: tempDir,
        gitdir: path.join(tempDir, '.git'),
        lineDiffAlgorithm: myersLineDiff,
      });
      const ctx: CommandContext = {
        currentDir: '/',
        fs: adapter,
        git: gitClient,
        author: { name: 't', email: 't@t' },
      };

      const parsed = await commandParser.execute('diff', ctx);
      expect(parsed.success).toBe(true);

      const { stdout: gitOut } = await execFileAsync('git', ['diff'], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(normalizeDiffPatchForCompare(parsed.output)).toBe(
        normalizeDiffPatchForCompare(gitOut),
      );
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('CommandParser diff <path> patch matches git diff <path>', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'a\n');
      await fs.writeFile(path.join(tempDir, 'b.txt'), 'b\n');
      await runGit(tempDir, ['add', 'a.txt', 'b.txt']);
      await runGit(tempDir, ['commit', '-m', 'c']);
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'a2\n');
      await fs.writeFile(path.join(tempDir, 'b.txt'), 'b2\n');

      const adapter = new NodeFSAdapter(tempDir);
      const gitClient = new GitClient({
        fs: adapter,
        dir: tempDir,
        gitdir: path.join(tempDir, '.git'),
        lineDiffAlgorithm: myersLineDiff,
      });
      const ctx: CommandContext = {
        currentDir: '/',
        fs: adapter,
        git: gitClient,
        author: { name: 't', email: 't@t' },
      };

      const parsed = await commandParser.execute('diff a.txt', ctx);
      expect(parsed.success).toBe(true);

      const { stdout: gitOut } = await execFileAsync('git', ['diff', 'a.txt'], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(normalizeDiffPatchForCompare(parsed.output)).toBe(
        normalizeDiffPatchForCompare(gitOut),
      );
      expect(parsed.output).toContain('a.txt');
      expect(parsed.output).not.toContain('b.txt');
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
