---
title: fetch
description: Fetch refs and objects from a remote repository
---

Fetch refs from a remote repository using git's protocol.

## GitClient Methods

### Fetch from Remote

```typescript
await git.fetch(remote: string, options?): Promise<FetchResult>
```

### Parameters

| Parameter  | Type     | Description                  |
| ---------- | -------- | ---------------------------- |
| `remote`   | `string` | Remote name (e.g., 'origin') |
| `options`  | `object` | Fetch options (optional)     |

## Low-level Functions

```typescript
import { fetch } from '@keydown-app/ts-git';
```

### fetch

```typescript
await fetch({
  fs,
  dir,
  remote,
  refspecs,
  noTags,
  tags
}): Promise<FetchResult>
```

| Parameter  | Type        | Default             | Description                |
| ---------- | ----------- | ------------------- | -------------------------- |
| `fs`       | `FSAdapter` | **required**        | Filesystem adapter         |
| `dir`      | `string`    | **required**        | Working directory path     |
| `remote`   | `string`    | **required**        | Remote name                |
| `gitdir`   | `string`    | `join(dir, '.git')` | Git directory path         |
| `refspecs` | `string[]`  | -                   | Refspecs to fetch          |
| `noTags`   | `boolean`   | `false`             | Don't fetch tags           |
| `tags`     | `string[]`  | -                   | Specific tags to fetch     |

### Return Value

Returns `FetchResult`:

```typescript
{
  remote: string;
  fetchedRefs: { name: string; oid: string; oldOid?: string }[];
  newObjects: number;
}
```

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

// Add a remote
await git.remote.add('origin', 'https://github.com/user/repo.git');

// Fetch from remote
const result = await git.fetch('origin');
console.log(result.fetchedRefs);
```

## See Also

- [pull](/commands/pull/) - Fetch and merge
- [push](/commands/push/) - Push to remote
- [remote](/commands/remote/) - Manage remotes