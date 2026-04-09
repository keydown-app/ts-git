---
title: push
description: Push commits to a remote repository
---

Push commits to a remote repository.

## GitClient Methods

### Push to Remote

```typescript
await git.push(remote: string, options?): Promise<PushResult>
```

### Parameters

| Parameter  | Type     | Description                  |
| ---------- | -------- | ---------------------------- |
| `remote`   | `string` | Remote name (e.g., 'origin') |
| `options`  | `object` | Push options (optional)      |

## Low-level Functions

```typescript
import { push } from '@keydown-app/ts-git';
```

### push

```typescript
await push({
  fs,
  dir,
  remote,
  remoteBranch,
  force,
  tags
}): Promise<PushResult>
```

| Parameter      | Type        | Default             | Description                   |
| -------------- | ----------- | ------------------- | ----------------------------- |
| `fs`           | `FSAdapter` | **required**        | Filesystem adapter            |
| `dir`          | `string`    | **required**        | Working directory path        |
| `remote`       | `string`    | **required**        | Remote name                   |
| `remoteBranch` | `string`    | -                   | Remote branch to push to      |
| `gitdir`       | `string`    | `join(dir, '.git')` | Git directory path            |
| `force`        | `boolean`   | `false`             | Force push (overwrite)        |
| `tags`         | `boolean`   | `false`             | Push all tags                 |

### Return Value

Returns `PushResult`:

```typescript
{
  remote: string;
  pushedRefs: { name: string; oldOid?: string; newOid: string }[];
  errors: string[];
}
```

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

// Commit some changes first
await git.add('.');
await git.commit('Update files');

// Push to origin
const result = await git.push('origin', { branch: 'main' });

console.log(result.pushedRefs);
```

## Note on Protocols

Currently supported:
- **SSH**: `git@github.com:user/repo.git`
- **File**: Local paths

HTTP/HTTPS push requires additional implementation.

## See Also

- [fetch](/commands/fetch/) - Fetch from remote
- [pull](/commands/pull/) - Fetch and merge
- [remote](/commands/remote/) - Manage remotes