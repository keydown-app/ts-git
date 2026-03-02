import { MemoryFS } from '../../fs/memory-adapter.js';
import { init } from '../../commands/init.js';

export interface TestRepo {
  fs: MemoryFS;
  dir: string;
  gitdir: string;
}

export async function createTestRepo(
  fs: MemoryFS,
  dir: string = '/repo',
  gitdir?: string,
  defaultBranch: string = 'master',
): Promise<TestRepo> {
  await init({
    fs,
    dir,
    gitdir,
    defaultBranch,
  });

  return {
    fs,
    dir,
    gitdir: gitdir ?? `${dir}/.git`,
  };
}

export function createFreshFS(): MemoryFS {
  return new MemoryFS();
}
