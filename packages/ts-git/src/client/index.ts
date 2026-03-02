import {
  init,
  add,
  remove,
  commit,
  status,
  statusMatrix,
  log,
  branch,
  listBranchesCommand,
  deleteBranch,
  checkoutBranch,
  reset,
  diff,
} from '../commands/index.js';
import {
  type StatusRow,
  type LogEntry,
  type Author,
  type DiffResult,
  type DiffSide,
  type LineDiffAlgorithm,
} from '../types.js';
import type { FSAdapter } from '../fs/types.js';
import { parseGitDir } from '../utils/path.js';

export interface GitClientOptions {
  fs: FSAdapter;
  dir?: string | null;
  gitdir?: string;
  defaultBranch?: string | null;
  /**
   * Default line diff algorithm for all diff operations.
   * Can be overridden per-call in GitClient.diff().
   * Install @keydown-app/ts-git-diff-myers for a standard implementation:
   *   npm install @keydown-app/ts-git-diff-myers
   */
  lineDiffAlgorithm?: LineDiffAlgorithm;
}

/**
 * Git operations wrapper using any FSAdapter implementation
 */
export class GitClient {
  private fs: FSAdapter;
  private dir: string | null;
  private gitdir: string | undefined;
  private defaultBranch: string;
  private lineDiffAlgorithm?: LineDiffAlgorithm;

  constructor(options: GitClientOptions) {
    this.fs = options.fs;
    this.dir = options.dir ?? null;
    this.gitdir = options.gitdir ?? undefined;
    this.defaultBranch = options.defaultBranch ?? 'master';
    this.lineDiffAlgorithm = options.lineDiffAlgorithm;
  }

  async init(options?: Partial<GitClientOptions>): Promise<void> {
    Object.assign(this, options);

    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await init({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      defaultBranch: this.defaultBranch,
    });
  }

  // async open(dir: string, gitdir?: string): Promise<void> {
  //   if (!(await this.fs.exists(dir))) {
  //     throw new Error('Directory does not exist.');
  //   }

  //   this.dir = dir;
  //   this.gitdir = gitdir ?? undefined;
  // }

  // async close(): Promise<void> {
  //   this.dir = null;
  // }

  async add(filepath: string): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await add({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      filepath,
    });
  }

  async addAll(): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    const matrix = await this.statusMatrix();
    for (const row of matrix) {
      const [filepath, headStatus, workdirStatus] = row;
      // Add files that are modified (head=1, workdir=2) or new/untracked (head=0, workdir=2)
      if (
        (headStatus === 1 && workdirStatus === 2) ||
        (headStatus === 0 && workdirStatus === 2)
      ) {
        await this.add(filepath);
      }
    }
  }

  async remove(filepath: string): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await remove({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      filepath,
    });
  }

  async commit(message: string, author: Author): Promise<string> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    return await commit({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      message,
      author,
    });
  }

  async status(filepath: string): Promise<string> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    return await status({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      filepath,
    });
  }

  async statusMatrix(): Promise<StatusRow[]> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    return await statusMatrix({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
    });
  }

  async log(depth?: number): Promise<LogEntry[]> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    return await log({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      depth,
    });
  }

  async branch(ref: string, checkout: boolean = false): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await branch({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      ref,
      checkout,
    });
  }

  async listBranches(): Promise<{
    branches: string[];
    current: string | null;
  }> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    return await listBranchesCommand({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
    });
  }

  async deleteBranch(ref: string, force: boolean = false): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await deleteBranch({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      ref,
      force,
    });
  }

  async checkoutBranch(ref: string): Promise<void> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    await checkoutBranch({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      ref,
    });
  }

  async reset(filepath?: string | string[]): Promise<string[]> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    const result = await reset({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      filepath,
    });

    return result.unstaged;
  }

  /** True when a workspace directory is bound (folder open). False before the host sets `dir`. */
  isWorkspaceReady(): boolean {
    return this.dir != null;
  }

  /**
   * Repository root and optional `.git` path (for CLI / callers that need explicit paths).
   */
  requireRepository(): { dir: string; gitdir?: string } {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }
    return { dir: this.dir, gitdir: this.gitdir };
  }

  /**
   * Generate a diff comparing two sides (worktree, index, commits, or trees).
   * Returns structured deltas; format with `formatDiff` from `@keydown-app/ts-git` in the CLI layer.
   *
   * @param options - Diff options including the required lineDiffAlgorithm
   * @throws Error if lineDiffAlgorithm is not provided
   */
  async diff(
    options: {
      left?: DiffSide;
      right?: DiffSide;
      cached?: boolean;
      paths?: string[];
      contextLines?: number;
      lineDiffAlgorithm?: LineDiffAlgorithm;
    } = {},
  ): Promise<DiffResult> {
    if (!this.dir) {
      throw new Error('Directory not set.');
    }

    // Use provided algorithm, or fall back to the one set in constructor
    const algorithm = options?.lineDiffAlgorithm ?? this.lineDiffAlgorithm;

    if (!algorithm) {
      throw new Error(
        'No diff algorithm provided. ' +
          'Please either:\n' +
          '1. Set it when creating GitClient:\n' +
          '   new GitClient({ ..., lineDiffAlgorithm: myersLineDiff })\n' +
          '2. Or pass it per-call:\n' +
          '   git.diff({ ..., lineDiffAlgorithm: myersLineDiff })\n\n' +
          'Install the Myers algorithm:\n' +
          '   npm install @keydown-app/ts-git-diff-myers',
      );
    }

    return await diff({
      fs: this.fs,
      dir: this.dir,
      gitdir: this.gitdir,
      left: options?.left,
      right: options?.right,
      cached: options?.cached,
      paths: options?.paths,
      contextLines: options?.contextLines,
      lineDiffAlgorithm: algorithm,
    });
  }

  /**
   * Check if the current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      if (!this.dir) {
        throw new Error('Directory not set.');
      }

      const { gitdir } = parseGitDir(this.dir, this.gitdir);

      return await this.fs.exists(gitdir);
    } catch {
      return false;
    }
  }
}
