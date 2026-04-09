---
title: pull
description: Fetch and merge changes from a remote repository
---

Fetch and merge changes from a remote repository into the current branch.

## GitClient Methods

### Pull from Remote

```typescript
await git.pull(remote: string, options?): Promise<PullResult>
```

### Parameters

| Parameter  | Type     | Description                  |
| ---------- | -------- | ---------------------------- |
| `remote`   | `string` | Remote name (e.g., 'origin') |
| `options`  | `object` | Pull options (optional)      |

## Low-level Functions

```typescript
import { pull } from '@keydown-app/ts-git';
```

### pull

```typescript
await pull({
  fs,
  dir,
  remote,
  branch,
  remoteBranch,
  force
}): Promise<PullResult>
```

| Parameter      | Type        | Default             | Description                   |
| -------------- | ----------- | ------------------- | ----------------------------- |
| `fs`           | `FSAdapter` | **required**        | Filesystem adapter            |
| `dir`          | `string`    | **required**        | Working directory path        |
| `remote`       | `string`    | **required**        | Remote name                   |
| `branch`       | `string`    | current branch      | Local branch to merge into    |
| `remoteBranch` | `string`    | -                   | Remote branch to pull from    |
| `gitdir`       | `string`    | `join(dir, '.git')` | Git directory path            |
| `force`        | `boolean`   | `false`             | Force fast-forward if behind  |

### Return Value

Returns `PullResult`:

```typescript
{
  remote: string;
  branch: string;
  fastForward: boolean;
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}
```

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

// Pull latest from origin
const result = await git.pull('origin', { branch: 'main' });

if (result.fastForward) {
  console.log('Fast-forwarded to latest');
} else {
  console.log('Merged changes');
}
```

## See Also

- [fetch](/commands/fetch/) - Fetch without merging
- [push](/commands/push/) - Push to remote
- [merge](/commands/merge/) - Merge branches