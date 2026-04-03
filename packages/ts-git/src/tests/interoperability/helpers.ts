import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { NodeFSAdapter } from '../../fs/node-adapter.js';

const execFileAsync = promisify(execFile);

export async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'ts-git-interop-'));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

export async function getGitOutput(
  cwd: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.toString().trim();
}

export interface GitIndexEntry {
  mode: string;
  oid: string;
  stage: number;
  path: string;
}

export function parseGitLsFiles(output: string): GitIndexEntry[] {
  const entries: GitIndexEntry[] = [];
  const lines = output.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Format: <mode> <oid> <stage>\t<path>
    const parts = line.split('\t');
    if (parts.length !== 2) continue;

    const [meta, filePath] = parts;
    const [mode, oid, stageStr] = meta.split(' ');

    entries.push({
      mode,
      oid,
      stage: parseInt(stageStr, 10),
      path: filePath,
    });
  }

  return entries;
}

export interface TestRepo {
  dir: string;
  gitdir: string;
  adapter: NodeFSAdapter;
}

export async function createTestRepo(): Promise<TestRepo> {
  const dir = await createTempDir();
  const gitdir = path.join(dir, '.git');

  await runGit(dir, ['init']);
  await runGit(dir, ['config', 'user.name', 'Test Author']);
  await runGit(dir, ['config', 'user.email', 'test@example.com']);

  const adapter = new NodeFSAdapter(dir);

  return { dir, gitdir, adapter };
}

export async function createCommit(
  repo: TestRepo,
  files: Record<string, string>,
  message: string,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repo.dir, filePath);
    const dir = path.dirname(fullPath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fullPath, content);
  }
  await runGit(repo.dir, ['add', '.']);
  await runGit(repo.dir, ['commit', '-m', message]);
}

export async function getGitIndexState(
  repo: TestRepo,
): Promise<GitIndexEntry[]> {
  const output = await getGitOutput(repo.dir, ['ls-files', '-s']);
  return parseGitLsFiles(output);
}

export async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if git is available and throws an error if REQUIRE_GIT env var is set.
 * Use this in interoperability tests that must run in CI.
 */
export async function requireGit(): Promise<void> {
  const isGitAvailable = await hasGit();

  if (process.env.REQUIRE_GIT === 'true') {
    if (!isGitAvailable) {
      throw new Error(
        'Git is required for interoperability tests but is not available.',
      );
    }
  }
}
