import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { readConfig, writeConfig, getConfigSection, setConfigSection, ConfigSection } from '../core/config.js';
import { NotAGitRepoError } from '../errors.js';

export interface RemoteInfo {
  name: string;
  fetch: string;
  url: string;
}

export interface RemoteListResult {
  remotes: RemoteInfo[];
}

/**
 * List all remotes with their URLs.
 */
export async function listRemotes(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
}): Promise<RemoteListResult> {
  const { fs, dir, gitdir = joinPaths(dir, '.git') } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const config = await readConfig(fs, gitdir);
  const remotes: RemoteInfo[] = [];

  for (const section of config.sections) {
    if (section.name === 'remote') {
      const name = section.subsection ?? '';
      const url = section.options.get('url') ?? '';
      const fetch = section.options.get('fetch') ?? '+refs/heads/*:refs/remotes/' + name + '/*';

      remotes.push({ name, url, fetch });
    }
  }

  // Sort by name
  remotes.sort((a, b) => a.name.localeCompare(b.name));

  return { remotes };
}

/**
 * Add a new remote repository.
 */
export async function addRemote(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  name: string;
  url: string;
  fetch?: string;
}): Promise<void> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), name, url, fetch } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const config = await readConfig(fs, gitdir);

  // Check if remote already exists
  const existing = getConfigSection(config, 'remote', name);
  if (existing) {
    throw new Error(`remote ${name} already exists.`);
  }

  // Create new remote section
  const newSection: ConfigSection = {
    name: 'remote',
    subsection: name,
    options: new Map([
      ['url', url],
    ]),
  };

  if (fetch) {
    newSection.options.set('fetch', fetch);
  } else {
    // Default fetch refspec
    newSection.options.set('fetch', '+refs/heads/*:refs/remotes/' + name + '/*');
  }

  setConfigSection(config, newSection);
  await writeConfig(fs, gitdir, config);
}

/**
 * Remove a remote repository.
 */
export async function removeRemote(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  name: string;
}): Promise<void> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), name } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const config = await readConfig(fs, gitdir);

  // Check if remote exists
  const existing = getConfigSection(config, 'remote', name);
  if (!existing) {
    throw new Error(`error: Could not find remote ${name}`);
  }

  // Remove the remote section
  config.sections = config.sections.filter(
    (s) => !(s.name === 'remote' && s.subsection === name),
  );

  await writeConfig(fs, gitdir, config);

  // Also remove the remote tracking branches
  const remotesPath = joinPaths(gitdir, 'refs', 'remotes', name);
  if (await fs.exists(remotesPath)) {
    await fs.rmdir(remotesPath, { recursive: true });
  }
}

/**
 * Get remote configuration by name.
 */
export async function getRemote(args: {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  name: string;
}): Promise<RemoteInfo | null> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), name } = args;

  if (!(await fs.exists(gitdir))) {
    throw new NotAGitRepoError(
      `not a git repository (or any of the parent directories): ${gitdir}`,
      dir,
    );
  }

  const config = await readConfig(fs, gitdir);
  const section = getConfigSection(config, 'remote', name);

  if (!section) {
    return null;
  }

  const url = section.options.get('url') ?? '';
  const fetch = section.options.get('fetch') ?? '+refs/heads/*:refs/remotes/' + name + '/*';

  return { name, url, fetch };
}