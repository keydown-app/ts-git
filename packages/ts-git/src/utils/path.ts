export function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

/**
 * Normalize a repo-relative path so index, tree walks, and diff deltas use the same key.
 * Strips leading `./`, collapses slashes, removes leading/trailing slashes.
 */
export function normalizeRepoRelativePath(filepath: string): string {
  let p = filepath.replace(/\\/g, '/');
  while (p.startsWith('./')) {
    p = p.slice(2);
  }
  p = p.replace(/\/+/g, '/');
  if (p.startsWith('/')) {
    p = p.slice(1);
  }
  if (p.endsWith('/') && p.length > 1) {
    p = p.slice(0, -1);
  }
  return p;
}

export function joinPaths(...paths: string[]): string {
  if (paths.length === 0) return '';

  const parts: string[] = [];
  for (const p of paths) {
    if (p) {
      parts.push(...p.split('/').filter(Boolean));
    }
  }

  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
}

export function dirname(filepath: string): string {
  const normalized = normalizeDir(filepath);

  if (normalized === '/') return '/';

  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '/';

  return normalized.slice(0, lastSlash) || '/';
}

export function basename(filepath: string, ext?: string): string {
  const normalized = normalizeDir(filepath);

  const lastSlash = normalized.lastIndexOf('/');
  const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;

  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length);
  }

  return name;
}

export function relative(from: string, to: string): string {
  const normalizedFrom = normalizeDir(from);
  const normalizedTo = normalizeDir(to);

  if (normalizedFrom === normalizedTo) return '';

  const fromParts = normalizedFrom.split('/').filter(Boolean);
  const toParts = normalizedTo.split('/').filter(Boolean);

  let commonLength = 0;
  const minLength = Math.min(fromParts.length, toParts.length);

  for (let i = 0; i < minLength; i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  const upCount = fromParts.length - commonLength;
  const downParts = toParts.slice(commonLength);

  const ups = upCount > 0 ? Array(upCount).fill('..') : [];

  return [...ups, ...downParts].join('/');
}

export function isAbsolute(filepath: string): boolean {
  // Unix-style absolute path
  if (filepath.startsWith('/')) return true;
  // Windows-style: C:\ or c:/
  if (/^[A-Za-z]:[\\/]/.test(filepath)) return true;
  // Windows UNC path: \\server\share
  if (filepath.startsWith('\\\\')) return true;
  return false;
}

export function resolvePaths(...paths: string[]): string {
  if (paths.length === 0) return '/';

  const parts: string[] = [];

  for (const p of paths) {
    if (!p) continue;

    const normalized = normalizeDir(p);

    if (normalized.startsWith('/')) {
      parts.length = 0;
      parts.push(...normalized.split('/').filter(Boolean));
    } else {
      parts.push(...normalized.split('/').filter(Boolean));
    }
  }

  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
}

export function isSubdir(parent: string, child: string): boolean {
  const normalizedParent = normalizeDir(parent);
  const normalizedChild = normalizeDir(child);

  if (normalizedParent === normalizedChild) return true;

  const rel = relative(normalizedParent, normalizedChild);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export function splitPath(filepath: string): string[] {
  const normalized = normalizeDir(filepath);
  if (normalized === '/') return [];
  return normalized.split('/').filter(Boolean);
}

export function parseGitDir(
  dir: string,
  gitdir?: string,
): { dir: string; gitdir: string } {
  const normalizedDir = normalizeDir(dir);
  const normalizedGitdir =
    gitdir && isAbsolute(gitdir)
      ? normalizeDir(gitdir)
      : joinPaths(normalizedDir, gitdir ?? '.git');

  return {
    dir: normalizedDir,
    gitdir: normalizedGitdir,
  };
}
