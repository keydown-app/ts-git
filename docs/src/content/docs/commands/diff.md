---
title: diff
description: Show changes between commits, index, and working tree
---
Show differences between various states of the repository.

## GitClient Method

```typescript
await git.diff(options?: DiffOptions): Promise<DiffResult>
```

### Parameters

| Parameter                   | Type                | Default            | Description                            |
| --------------------------- | ------------------- | ------------------ | -------------------------------------- |
| `options.left`              | `DiffSide`          | `'HEAD'`           | Left side of comparison                |
| `options.right`             | `DiffSide`          | `'worktree'`       | Right side of comparison               |
| `options.cached`            | `boolean`           | `false`            | Compare index to HEAD (staged changes) |
| `options.paths`             | `string[]`          | `undefined`        | Limit diff to specific paths           |
| `options.contextLines`      | `number`            | `3`                | Number of context lines                |
| `options.lineDiffAlgorithm` | `LineDiffAlgorithm` | (from constructor) | Line diff algorithm (required)         |

### DiffSide

```typescript
type DiffSide = 'HEAD' | 'index' | 'worktree' | string;
```

- `'HEAD'` - The latest commit
- `'index'` - The staging area
- `'worktree'` - The working directory
- `string` - A commit SHA or ref

### Returns

Returns a `DiffResult` object:

```typescript
interface DiffResult {
  deltas: Delta[];
}

interface Delta {
  oldPath: string | null;
  newPath: string | null;
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  oldFile?: FileInfo;
  newFile?: FileInfo;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: LineChange[];
}

interface LineChange {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

## Low-level Function

```typescript
import {
  diff,
  formatDiff,
  formatPatch,
  formatNameOnly,
  formatNameStatus,
  formatStat,
} from '@keydown-app/ts-git';
```

### diff

```typescript
await diff({
  fs,
  dir,
  left?,
  right?,
  cached?,
  paths?,
  contextLines?,
  lineDiffAlgorithm
}): Promise<DiffResult>
```

### Format Functions

Convert diff results to string formats:

```typescript
// Full unified diff format
const patch = formatPatch(result);

// Human-readable summary
const summary = formatDiff(result);

// Just filenames
const names = formatNameOnly(result);

// Filenames with status
const status = formatNameStatus(result);

// Diffstat summary
const stat = formatStat(result);
```

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';
import { myersLineDiff } from '@keydown-app/ts-git-diff-myers';

const fs = new MemoryFSAdapter();
const git = new GitClient({
  fs,
  dir: '/my-repo',
  defaultBranch: 'main',
  lineDiffAlgorithm: myersLineDiff,
});

await git.init();

// Create initial commit
await fs.writeFile('/my-repo/README.md', 'Hello', 'utf8');
await git.add('README.md');
await git.commit('Initial', {
  name: 'John',
  email: 'john@example.com',
});

// Modify file
await fs.writeFile('/my-repo/README.md', 'Hello World!', 'utf8');

// Show unstaged changes (worktree vs index)
const unstaged = await git.diff();
console.log('Unstaged changes:', unstaged.deltas.length);

// Stage the changes
await git.add('README.md');

// Show staged changes (index vs HEAD)
const staged = await git.diff({ cached: true });
console.log('Staged changes:', staged.deltas.length);

// Compare two commits
const commits = await git.log(2);
const betweenCommits = await git.diff({
  left: commits[1].oid, // First commit
  right: commits[0].oid, // Second commit
});

// Format output
const patch = formatPatch(staged);
console.log(patch);
```

## Supported Diff Features

- **Worktree vs Index** (`git diff`): Shows unstaged changes
- **Index vs HEAD** (`git diff --cached`): Shows staged changes
- **Commit comparisons** (`git diff A B`): Shows differences between commits
- **Path filtering** (`git diff -- <path>`): Limits to specific paths
- **Output formats**:
  - Default unified diff with patch format
  - `--name-only`: Lists only changed filenames
  - `--name-status`: Shows status (A/M/D) and filenames
  - `--stat`: Shows diffstat summary

## Requirements

You must provide a `lineDiffAlgorithm`. Install the Myers algorithm:

```bash
npm install @keydown-app/ts-git-diff-myers
```

```typescript
import { myersLineDiff } from '@keydown-app/ts-git-diff-myers';

const git = new GitClient({
  fs,
  dir: '/my-repo',
  lineDiffAlgorithm: myersLineDiff, // Set in constructor
});

// Or pass per-call
const result = await git.diff({
  lineDiffAlgorithm: myersLineDiff,
});
```

## See Also

- [status](/commands/status/) - Check file status
- [add](/commands/add/) - Stage changes
