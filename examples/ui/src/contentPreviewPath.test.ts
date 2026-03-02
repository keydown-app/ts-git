import { describe, expect, it } from 'vitest';
import { normalizeRepoRelativePath, relative } from '@keydown-app/ts-git';

/** Same formula as ContentPreview.getRepoRelativePath — pathspec for git.diff paths. */
function previewDiffPathspec(repoRoot: string, filepath: string): string {
  return normalizeRepoRelativePath(relative(repoRoot, filepath));
}

describe('ContentPreview diff pathspec', () => {
  it('keeps full repo-relative path when repo root is / and file is under src/', () => {
    expect(previewDiffPathspec('/', '/src/a.txt')).toBe('src/a.txt');
  });

  it('does not collapse to basename when repo root is / (regression: cwd used as root)', () => {
    // Wrong approach: strip using terminal cwd /src → pathspec "a.txt" misses snapshot key "src/a.txt"
    expect(previewDiffPathspec('/src', '/src/a.txt')).toBe('a.txt');
    expect(previewDiffPathspec('/', '/src/a.txt')).not.toBe('a.txt');
  });
});
