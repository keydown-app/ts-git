---
title: status
description: Show working tree status
---
Check the status of files in the working tree.

## GitClient Methods

### Status of Single File

```typescript
await git.status(filepath: string): Promise<string>
```

### Status Matrix

```typescript
await git.statusMatrix(): Promise<StatusRow[]>
```

## Low-level Functions

```typescript
import { status, statusMatrix, classifyStatusRow } from '@keydown-app/ts-git';
```

### status

```typescript
await status({
  fs,
  dir,
  filepath
}): Promise<string>
```

### Parameters

| Parameter  | Type        | Default             | Description            |
| ---------- | ----------- | ------------------- | ---------------------- |
| `fs`       | `FSAdapter` | **required**        | Filesystem adapter     |
| `dir`      | `string`    | **required**        | Working directory path |
| `gitdir`   | `string`    | `join(dir, '.git')` | Git directory path     |
| `filepath` | `string`    | **required**        | File path to check     |

### Returns

Returns one of the following status strings:

| Status         | Description                        |
| -------------- | ---------------------------------- |
| `'unmodified'` | File is unchanged                  |
| `'modified'`   | File has been modified             |
| `'*modified'`  | File has unstaged modifications    |
| `'added'`      | File is staged for addition        |
| `'*added'`     | File is untracked (not staged)     |
| `'deleted'`    | File is staged for deletion        |
| `'*deleted'`   | File has been deleted (not staged) |
| `'untracked'`  | File is not tracked by Git         |

### statusMatrix

Returns a matrix of status information for all files:

```typescript
await statusMatrix({
  fs,
  dir
}): Promise<StatusRow[]>
```

### StatusRow

```typescript
type StatusRow = [
  filepath: string,
  headStatus: 0 | 1,
  workdirStatus: 0 | 1 | 2,
  stageStatus: 0 | 1 | 2 | 3,
];
```

**Status codes:**

- `0` = absent
- `1` = present (same as HEAD)
- `2` = modified
- `3` = added

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

await git.init();

// Check status of untracked file
await fs.writeFile('/my-repo/README.md', '# Hello', 'utf8');
const status1 = await git.status('README.md');
console.log(status1); // 'untracked'

// After staging
await git.add('README.md');
const status2 = await git.status('README.md');
console.log(status2); // 'added'

// After committing
await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});
const status3 = await git.status('README.md');
console.log(status3); // 'unmodified'

// Modify the file
await fs.writeFile('/my-repo/README.md', '# Hello World!', 'utf8');
const status4 = await git.status('README.md');
console.log(status4); // '*modified'

// Get full status matrix
const matrix = await git.statusMatrix();
console.log(matrix);
// [['README.md', 1, 2, 1], ...]
```

## See Also

- [add](/commands/add/) - Stage files
- [diff](/commands/diff/) - Show differences
