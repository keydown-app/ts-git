import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { NodeFSAdapter } from '../../fs/node-adapter.js';
import { statusMatrix, classifyStatusRow } from '../../commands/status.js';
import { parseIndex, CE_EXTENDED } from '../../core/index.js';
import {
  createTempDir,
  cleanupTempDir,
  runGit,
  requireGit,
} from './helpers.js';
import type { StatusRow } from '../../types.js';

const execFileAsync = promisify(execFile);

function matrixRowToPorcelainLine(row: StatusRow): string | null {
  const [filepath] = row;
  const c = classifyStatusRow(row);
  if (c.isClean) return null;
  if (c.isUntracked) return `?? ${filepath}`;
  const x = c.isStaged ? c.stagedStatus : ' ';
  const y = c.isUnstaged ? c.unstagedStatus : ' ';
  return `${x}${y} ${filepath}`;
}

function tsGitPorcelain(matrix: StatusRow[]): string[] {
  const lines: string[] = [];
  for (const row of matrix) {
    const line = matrixRowToPorcelainLine(row);
    if (line) lines.push(line);
  }
  return lines.sort();
}

async function gitPorcelainV1(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1'], {
    cwd,
    encoding: 'utf8',
  });
  return stdout
    .split('\n')
    .map((l: string) => l.trimEnd())
    .filter((l: string) => l.length > 0)
    .sort();
}

describe('status vs git porcelain', () => {
  beforeAll(async () => {
    await requireGit();
  });

  it('matches git status --porcelain=v1 after commit, unstaged edit, untracked, and partial stage', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);

      await fs.writeFile(path.join(tempDir, 'tracked.txt'), 'v1\n');
      await fs.writeFile(path.join(tempDir, 'stay.txt'), 'ok\n');
      await runGit(tempDir, ['add', 'tracked.txt', 'stay.txt']);
      await runGit(tempDir, ['commit', '-m', 'first']);

      await fs.writeFile(path.join(tempDir, 'tracked.txt'), 'v2\n');
      await fs.writeFile(path.join(tempDir, 'new.txt'), 'fresh\n');
      await runGit(tempDir, ['add', 'tracked.txt']);

      const adapter = new NodeFSAdapter(tempDir);
      const matrix = await statusMatrix({ fs: adapter, dir: tempDir });
      expect(tsGitPorcelain(matrix)).toEqual(await gitPorcelainV1(tempDir));
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('parseIndex reads git-produced index with CE_EXTENDED (skip-worktree)', async () => {
    const tempDir = await createTempDir();
    try {
      await runGit(tempDir, ['init']);
      await runGit(tempDir, ['config', 'user.email', 'interop@test.local']);
      await runGit(tempDir, ['config', 'user.name', 'Interop Test']);
      await fs.writeFile(path.join(tempDir, 'skipme.txt'), 'body\n');
      await runGit(tempDir, ['add', 'skipme.txt']);
      await runGit(tempDir, ['update-index', '--skip-worktree', 'skipme.txt']);

      const buf = new Uint8Array(
        await fs.readFile(path.join(tempDir, '.git', 'index')),
      );
      const idx = parseIndex(buf);
      expect(idx.entries).toHaveLength(1);
      expect(idx.entries[0].path).toBe('skipme.txt');
      expect(idx.entries[0].flags & CE_EXTENDED).toBe(CE_EXTENDED);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
