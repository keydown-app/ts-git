---
title: remove
description: Remove files from the git index
---
Remove a file from the git index (staging area).

## GitClient Method

```typescript
await git.remove(filepath: string): Promise<void>
```

### Parameters

| Parameter  | Type     | Description                           |
| ---------- | -------- | ------------------------------------- |
| `filepath` | `string` | Path to the file to remove from index |

### Example

```typescript
await git.remove('README.md');
```

## Low-level Function

```typescript
import { remove } from '@keydown-app/ts-git';

await remove({
  fs,
  dir,
  filepath
}): Promise<void>
```

### Parameters

| Parameter  | Type        | Default             | Description                    |
| ---------- | ----------- | ------------------- | ------------------------------ |
| `fs`       | `FSAdapter` | **required**        | Filesystem adapter             |
| `dir`      | `string`    | **required**        | Working directory path         |
| `gitdir`   | `string`    | `join(dir, '.git')` | Git directory path             |
| `filepath` | `string`    | **required**        | File path to remove from index |

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

await git.init();

// Create and stage a file
await fs.writeFile('/my-repo/temp.txt', 'temporary', 'utf8');
await git.add('temp.txt');

// Remove it from the index (but keep the file)
await git.remove('temp.txt');

// The file is now untracked
const status = await git.status('temp.txt');
console.log(status); // 'untracked'
```

## See Also

- [add](/commands/add/) - Stage files
- [reset](/commands/reset/) - Unstage files
