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
} from '../commands/index.js';
import type { StatusRow, LogEntry, Author } from '../types.js';
import type { FSAdapter as TauriFSAdapter } from '../fs/types.js';

/**
 * Git operations wrapper using TauriFSAdapter
 */
export class GitOperations {
  private fs: TauriFSAdapter;
  private dir: string;

  constructor(fs: TauriFSAdapter, dir: string) {
    this.fs = fs;
    this.dir = dir;
  }

  async init(defaultBranch: string = 'master'): Promise<void> {
    await init({
      fs: this.fs,
      dir: this.dir,
      defaultBranch,
    });
  }

  async add(filepath: string): Promise<void> {
    await add({
      fs: this.fs,
      dir: this.dir,
      filepath,
    });
  }

  async addAll(): Promise<void> {
    const statusRows = await this.statusMatrix();
    for (const row of statusRows) {
      const [filepath, headStatus, workdirStatus] = row;
      // Add files that are new or modified
      if (headStatus === 0 || workdirStatus === 2) {
        await this.add(filepath);
      }
    }
  }

  async remove(filepath: string): Promise<void> {
    await remove({
      fs: this.fs,
      dir: this.dir,
      filepath,
    });
  }

  async commit(message: string, author: Author): Promise<string> {
    return await commit({
      fs: this.fs,
      dir: this.dir,
      message,
      author,
    });
  }

  async status(filepath: string): Promise<string> {
    return await status({
      fs: this.fs,
      dir: this.dir,
      filepath,
    });
  }

  async statusMatrix(): Promise<StatusRow[]> {
    return await statusMatrix({
      fs: this.fs,
      dir: this.dir,
    });
  }

  async log(depth?: number): Promise<LogEntry[]> {
    return await log({
      fs: this.fs,
      dir: this.dir,
      depth,
    });
  }

  async branch(ref: string, checkout: boolean = false): Promise<void> {
    await branch({
      fs: this.fs,
      dir: this.dir,
      ref,
      checkout,
    });
  }

  async listBranches(): Promise<{
    branches: string[];
    current: string | null;
  }> {
    return await listBranchesCommand({
      fs: this.fs,
      dir: this.dir,
    });
  }

  async deleteBranch(ref: string, force: boolean = false): Promise<void> {
    await deleteBranch({
      fs: this.fs,
      dir: this.dir,
      ref,
      force,
    });
  }

  async checkoutBranch(ref: string): Promise<void> {
    await checkoutBranch({
      fs: this.fs,
      dir: this.dir,
      ref,
    });
  }
}
