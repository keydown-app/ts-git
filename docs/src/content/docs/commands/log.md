---
title: log
description: Show commit history
---
View the commit history.

## GitClient Method

```typescript
await git.log(depth?: number): Promise<LogEntry[]>
```

### Parameters

| Parameter | Type     | Default       | Description                         |
| --------- | -------- | ------------- | ----------------------------------- |
| `depth`   | `number` | (all commits) | Maximum number of commits to return |

### Returns

Returns an array of `LogEntry` objects:

```typescript
interface LogEntry {
  oid: string;
  commit: {
    message: string;
    tree: string;
    parent: string[];
    author: {
      name: string;
      email: string;
      timestamp: number;
      timezoneOffset: number;
    };
    committer: {
      name: string;
      email: string;
      timestamp: number;
      timezoneOffset: number;
    };
    gpgsig?: string;
  };
  payload: string;
}
```

## Low-level Function

```typescript
import { log, readCommit } from '@keydown-app/ts-git';

await log({
  fs,
  dir,
  depth?
}): Promise<LogEntry[]>
```

### Parameters

| Parameter | Type        | Default             | Description               |
| --------- | ----------- | ------------------- | ------------------------- |
| `fs`      | `FSAdapter` | **required**        | Filesystem adapter        |
| `dir`     | `string`    | **required**        | Working directory path    |
| `gitdir`  | `string`    | `join(dir, '.git')` | Git directory path        |
| `depth`   | `number`    | (all commits)       | Maximum commits to return |

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

await git.init();

// Create some commits
await fs.writeFile('/my-repo/file1.txt', 'content1', 'utf8');
await git.add('file1.txt');
await git.commit('First commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

await fs.writeFile('/my-repo/file2.txt', 'content2', 'utf8');
await git.add('file2.txt');
await git.commit('Second commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

// Get all commits
const commits = await git.log();

console.log(commits.length); // 2
console.log(commits[0].commit.message); // 'Second commit'
console.log(commits[1].commit.message); // 'First commit'

// Get limited history
const recent = await git.log(1);
console.log(recent.length); // 1
```

## readCommit

Read a single commit by its OID:

```typescript
import { readCommit } from '@keydown-app/ts-git';

const commit = await readCommit({ fs, dir, oid: 'abc123...' });
```

## See Also

- [commit](/commands/commit/) - Create a commit
