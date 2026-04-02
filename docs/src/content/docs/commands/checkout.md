---
title: checkout
description: Switch branches
---
Switch to a different branch.

## GitClient Method

```typescript
await git.checkoutBranch(ref: string): Promise<void>
```

### Parameters

| Parameter | Type     | Description             |
| --------- | -------- | ----------------------- |
| `ref`     | `string` | Branch name to checkout |

## Low-level Function

```typescript
import { checkoutBranch } from '@keydown-app/ts-git';

await checkoutBranch({
  fs,
  dir,
  ref
}): Promise<void>
```

### Parameters

| Parameter | Type        | Default             | Description             |
| --------- | ----------- | ------------------- | ----------------------- |
| `fs`      | `FSAdapter` | **required**        | Filesystem adapter      |
| `dir`     | `string`    | **required**        | Working directory path  |
| `gitdir`  | `string`    | `join(dir, '.git')` | Git directory path      |
| `ref`     | `string`    | **required**        | Branch name to checkout |

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

await git.init();

// Create initial commit
await fs.writeFile('/my-repo/README.md', '# Main Branch', 'utf8');
await git.add('README.md');
await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

// Create a feature branch
await git.branch('feature');

// Switch to feature branch
await git.checkoutBranch('feature');

// Make changes on feature branch
await fs.writeFile('/my-repo/feature.txt', 'New feature', 'utf8');
await git.add('feature.txt');
await git.commit('Add feature', {
  name: 'John Doe',
  email: 'john@example.com',
});

// Switch back to main
await git.checkoutBranch('main');

// feature.txt doesn't exist on main
const exists = await fs.exists('/my-repo/feature.txt');
console.log(exists); // false

// List branches to confirm current
const branches = await git.listBranches();
console.log(branches.current); // 'main'
```

## See Also

- [branch](/commands/branch/) - Create and manage branches
- [commit](/commands/commit/) - Create commits
