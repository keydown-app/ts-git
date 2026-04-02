---
title: branch
description: List, create, or delete branches
---

Manage Git branches.

## GitClient Methods

### Create a Branch

```typescript
await git.branch(ref: string, checkout?: boolean): Promise<void>
```

### List Branches

```typescript
await git.listBranches(): Promise<{
  branches: string[];
  current: string | null;
}>
```

### Delete a Branch

```typescript
await git.deleteBranch(ref: string, force?: boolean): Promise<void>
```

## Low-level Functions

```typescript
import {
  branch,
  listBranchesCommand,
  deleteBranch,
  checkoutBranch,
} from '@keydown-app/ts-git';
```

### branch

Create a new branch:

```typescript
await branch({
  fs,
  dir,
  ref,
  checkout?
}): Promise<void>
```

### Parameters

| Parameter  | Type        | Default             | Description             |
| ---------- | ----------- | ------------------- | ----------------------- |
| `fs`       | `FSAdapter` | **required**        | Filesystem adapter      |
| `dir`      | `string`    | **required**        | Working directory path  |
| `gitdir`   | `string`    | `join(dir, '.git')` | Git directory path      |
| `ref`      | `string`    | **required**        | Branch name             |
| `checkout` | `boolean`   | `false`             | Checkout the new branch |

### listBranchesCommand

List all branches:

```typescript
await listBranchesCommand({
  fs,
  dir
}): Promise<{ branches: string[]; current: string | null }>
```

### deleteBranch

Delete a branch:

```typescript
await deleteBranch({
  fs,
  dir,
  ref,
  force?
}): Promise<void>
```

| Parameter | Type      | Default      | Description                     |
| --------- | --------- | ------------ | ------------------------------- |
| `ref`     | `string`  | **required** | Branch name to delete           |
| `force`   | `boolean` | `false`      | Force delete even if not merged |

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

// List branches (just 'main' for now)
const list1 = await git.listBranches();
console.log(list1.branches); // ['main']
console.log(list1.current); // 'main'

// Create a new branch and checkout
await git.branch('feature', true);

// List again
const list2 = await git.listBranches();
console.log(list2.branches); // ['main', 'feature']
console.log(list2.current); // 'feature'

// Switch back to main
await git.checkoutBranch('main');

// Delete the feature branch
await git.deleteBranch('feature');

const list3 = await git.listBranches();
console.log(list3.branches); // ['main']
```

## See Also

- [checkout](/commands/checkout/) - Switch branches
- [commit](/commands/commit/) - Create commits
