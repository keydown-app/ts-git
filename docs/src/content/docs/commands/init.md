---
title: init
description: Initialize a new Git repository
---
Initialize a new Git repository.

## GitClient Method

```typescript
await git.init(options?: Partial<GitClientOptions>): Promise<void>
```

### Parameters

| Parameter               | Type             | Default            | Description                          |
| ----------------------- | ---------------- | ------------------ | ------------------------------------ |
| `options.fs`            | `FSAdapter`      | (from constructor) | Filesystem adapter                   |
| `options.dir`           | `string \| null` | (from constructor) | Working directory path               |
| `options.gitdir`        | `string`         | (from constructor) | Git directory path (default: `.git`) |
| `options.defaultBranch` | `string \| null` | (from constructor) | Default branch name                  |

### Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({
  fs,
  dir: '/my-repo',
  defaultBranch: 'main',
});

await git.init();
console.log('Repository initialized!');
```

## Low-level Function

You can also use the command function directly:

```typescript
import { init } from '@keydown-app/ts-git';
import { MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();

await init({
  fs,
  dir: '/my-repo',
  defaultBranch: 'main',
});
```

### Options

| Option          | Type        | Default             | Description            |
| --------------- | ----------- | ------------------- | ---------------------- |
| `fs`            | `FSAdapter` | **required**        | Filesystem adapter     |
| `dir`           | `string`    | **required**        | Working directory path |
| `gitdir`        | `string`    | `join(dir, '.git')` | Git directory path     |
| `defaultBranch` | `string`    | `'master'`          | Default branch name    |

## See Also

- [add](/commands/add/) - Stage files
- [commit](/commands/commit/) - Create a commit
