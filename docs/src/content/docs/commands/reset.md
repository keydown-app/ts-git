---
title: reset
description: Unstage files
---
Remove files from the staging area (index).

## GitClient Method

```typescript
await git.reset(filepath?: string | string[]): Promise<string[]>
```

### Parameters

| Parameter  | Type                 | Description                                              |
| ---------- | -------------------- | -------------------------------------------------------- |
| `filepath` | `string \| string[]` | File path(s) to unstage. If omitted, unstages all files. |

### Returns

Returns an array of file paths that were unstaged.

## Low-level Function

```typescript
import { reset } from '@keydown-app/ts-git';

await reset({
  fs,
  dir,
  filepath?
}): Promise<{ unstaged: string[] }>
```

### Parameters

| Parameter  | Type                 | Default             | Description             |
| ---------- | -------------------- | ------------------- | ----------------------- |
| `fs`       | `FSAdapter`          | **required**        | Filesystem adapter      |
| `dir`      | `string`             | **required**        | Working directory path  |
| `gitdir`   | `string`             | `join(dir, '.git')` | Git directory path      |
| `filepath` | `string \| string[]` | `undefined`         | File path(s) to unstage |

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

await git.init();

// Create initial commit
await fs.writeFile('/my-repo/README.md', '# Project', 'utf8');
await git.add('README.md');
await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

// Stage some changes
await fs.writeFile('/my-repo/README.md', '# Updated Project', 'utf8');
await fs.writeFile('/my-repo/new.txt', 'new file', 'utf8');
await git.add('README.md');
await git.add('new.txt');

// Check status - both staged
const status1 = await git.status('README.md');
console.log(status1); // 'modified'

// Unstage a single file
await git.reset('README.md');

// Check status - README.md is unstaged
const status2 = await git.status('README.md');
console.log(status2); // '*modified'

// new.txt is still staged
const status3 = await git.status('new.txt');
console.log(status3); // 'added'

// Unstage all remaining files
await git.reset();

// Both are now unstaged
const status4 = await git.status('new.txt');
console.log(status4); // '*added'
```

## See Also

- [add](/commands/add/) - Stage files
- [remove](/commands/remove/) - Remove files from index
