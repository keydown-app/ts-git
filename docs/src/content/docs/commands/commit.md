---
title: commit
description: Create a new commit
---
Create a new commit with the staged changes.

## GitClient Method

```typescript
await git.commit(
  message: string,
  author: Author
): Promise<string>
```

### Parameters

| Parameter | Type     | Description               |
| --------- | -------- | ------------------------- |
| `message` | `string` | Commit message            |
| `author`  | `Author` | Commit author information |

### Author Type

```typescript
interface Author {
  name: string;
  email: string;
}
```

### Returns

Returns the SHA-1 hash of the created commit.

## Low-level Function

```typescript
import { commit } from '@keydown-app/ts-git';

await commit({
  fs,
  dir,
  message,
  author
}): Promise<string>
```

### Parameters

| Parameter | Type        | Default             | Description                     |
| --------- | ----------- | ------------------- | ------------------------------- |
| `fs`      | `FSAdapter` | **required**        | Filesystem adapter              |
| `dir`     | `string`    | **required**        | Working directory path          |
| `gitdir`  | `string`    | `join(dir, '.git')` | Git directory path              |
| `message` | `string`    | **required**        | Commit message                  |
| `author`  | `Author`    | **required**        | Commit author `{ name, email }` |

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

await git.init();

// Create and stage a file
await fs.writeFile('/my-repo/README.md', '# My Project', 'utf8');
await git.add('README.md');

// Create commit
const commitHash = await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

console.log('Created commit:', commitHash);
// Output: Created commit: a1b2c3d4e5f6...
```

## Multiple Commits

```typescript
// First commit
await fs.writeFile('/my-repo/README.md', '# My Project', 'utf8');
await git.add('README.md');
await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

// Second commit
await fs.writeFile('/my-repo/src/index.ts', 'console.log("hello");', 'utf8');
await git.add('src/index.ts');
await git.commit('Add index.ts', {
  name: 'John Doe',
  email: 'john@example.com',
});

// View history
const commits = await git.log();
console.log(commits.length); // 2
```

## See Also

- [add](/commands/add/) - Stage files
- [log](/commands/log/) - View commit history
