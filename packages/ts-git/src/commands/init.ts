import { joinPaths, parseGitDir, isAbsolute } from '../utils/path.js';
import {
  createDefaultConfig,
  writeConfig,
  setDefaultBranch,
} from '../core/config.js';
import { setHead } from '../core/refs.js';
import { serializeIndex } from '../core/index.js';
import { InvalidGitDirError } from '../errors.js';
import type { InitArgs } from '../types.js';

export async function init(args: InitArgs): Promise<void> {
  const { fs, dir, gitdir: providedGitdir, defaultBranch = 'master' } = args;

  // Validate that gitdir is absolute if provided
  if (providedGitdir && !isAbsolute(providedGitdir)) {
    throw new InvalidGitDirError('gitdir must be an absolute path');
  }

  const { gitdir } = parseGitDir(dir, providedGitdir);

  const dirs = [
    joinPaths(gitdir, 'objects', 'info'),
    joinPaths(gitdir, 'objects', 'pack'),
    joinPaths(gitdir, 'refs', 'heads'),
    joinPaths(gitdir, 'refs', 'tags'),
    joinPaths(gitdir, 'refs', 'remotes'),
    joinPaths(gitdir, 'hooks'),
    joinPaths(gitdir, 'info'),
  ];

  for (const dirPath of dirs) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  const config = createDefaultConfig();

  setDefaultBranch(config, defaultBranch);

  await writeConfig(fs, gitdir, config);

  await fs.writeFile(joinPaths(gitdir, 'description'), 'Unnamed repository\n');

  await setHead(fs, gitdir, `refs/heads/${defaultBranch}`);

  const emptyIndex = await serializeIndex({ version: 2, entries: [] });
  await fs.writeFile(joinPaths(gitdir, 'index'), emptyIndex);
}
