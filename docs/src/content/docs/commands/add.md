---
title: add
description: Stage files for commit
---

Add a file to the git index (staging area).

## GitClient Methods

### Add a Single File

```typescript
await git.add(filepath: string): Promise<void>
```

### Add All Changes

```typescript
await git.addAll(): Promise<void>
```

### Parameters

| Parameter  | Type     | Description               |
| ---------- | -------- | ------------------------- |
| `filepath` | `string` | Path to the file to stage |

### Example

```typescript
// Stage a single file
await git.add('README.md');

// Stage all changes
await git.addAll();
```

## Low-level Functions

```typescript
import { add, addAll, remove } from '@keydown-app/ts-git';
```

### add

```typescript
await add({
  fs,
  dir,
  filepath
}): Promise<void>
```

| Parameter  | Type        | Default             | Description            |
| ---------- | ----------- | ------------------- | ---------------------- |
| `fs`       | `FSAdapter` | **required**        | Filesystem adapter     |
| `dir`      | `string`    | **required**        | Working directory path |
| `gitdir`   | `string`    | `join(dir, '.git')` | Git directory path     |
| `filepath` | `string`    | **required**        | File path to stage     |

### addAll

Stages all modified and untracked files:

```typescript
await addAll({
  fs,
  dir
}): Promise<void>
```

## Complete Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

await git.init();

// Create some files
await fs.writeFile('/my-repo/README.md', '# Hello', 'utf8');
await fs.writeFile('/my-repo/src/index.ts', 'console.log("hi");', 'utf8');

// Stage files
await git.add('README.md'); // Stage single file
await git.add('src/index.ts'); // Stage another file

// Or stage everything at once
// await git.addAll();

// Commit
await git.commit('Add initial files', {
  name: 'John Doe',
  email: 'john@example.com',
});
```

## See Also

- [remove](/commands/remove/) - Remove files from index
- [reset](/commands/reset/) - Unstage files
- [commit](/commands/commit/) - Create a commit
