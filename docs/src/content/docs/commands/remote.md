---
title: remote
description: Manage remote repositories
---

List, add, and remove remote repositories.

## GitClient Methods

### List Remotes

```typescript
await git.remote.list(): Promise<RemoteInfo[]>
```

### Add Remote

```typescript
await git.remote.add(name: string, url: string): Promise<void>
```

### Remove Remote

```typescript
await git.remote.remove(name: string): Promise<void>
```

### Get Remote Info

```typescript
await git.remote.getInfo(name: string): Promise<RemoteInfo>
```

## Low-level Functions

```typescript
import { remote } from '@keydown-app/ts-git';
```

### remote

```typescript
await remote({
  fs,
  dir,
  command,
  remoteName,
  remoteUrl
}): Promise<RemoteResult>
```

| Parameter     | Type        | Default             | Description               |
| ------------- | ----------- | ------------------- | ------------------------- |
| `fs`          | `FSAdapter` | **required**        | Filesystem adapter        |
| `dir`         | `string`    | **required**        | Working directory path    |
| `gitdir`      | `string`    | `join(dir, '.git')` | Git directory path        |
| `command`     | `string`    | **required**        | 'add', 'remove', 'list'   |
| `remoteName`  | `string`    | -                   | Remote name               |
| `remoteUrl`   | `string`    | -                   | Remote URL                |
| `verbose`     | `boolean`   | `false`             | Show URLs with names      |

### Return Value

Returns `RemoteResult`:

```typescript
{
  remotes: RemoteInfo[];
}
```

## Examples

### List all remotes

```typescript
const remotes = await git.remote.list();
console.log(remotes);
// [{ name: 'origin', url: 'https://github.com/user/repo.git' }]
```

### Add a remote

```typescript
await git.remote.add('upstream', 'https://github.com/user/upstream.git');
```

### Remove a remote

```typescript
await git.remote.remove('origin');
```

### Get remote info

```typescript
const info = await git.remote.getInfo('origin');
console.log(info);
// { name: 'origin', url: 'https://github.com/user/repo.git', fetch: '...', push: '...' }
```

## Remote URL Formats

- **HTTPS**: `https://github.com/user/repo.git`
- **SSH**: `git@github.com:user/repo.git`
- **File**: `/path/to/repo.git`

## See Also

- [fetch](/commands/fetch/) - Fetch from remote
- [pull](/commands/pull/) - Pull from remote
- [push](/commands/push/) - Push to remote