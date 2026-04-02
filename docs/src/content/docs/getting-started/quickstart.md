---
title: Quick Start
description: Get up and running with TS-Git in minutes
---
This guide will walk you through creating your first Git repository with TS-Git.

## Setup

First, import the necessary classes:

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';
```

## Create a Filesystem

TS-Git uses a pluggable filesystem adapter. For this example, we'll use the in-memory adapter:

```typescript
const fs = new MemoryFSAdapter();
```

## Initialize the Client

Create a `GitClient` instance with your filesystem and directory:

```typescript
const git = new GitClient({
  fs,
  dir: '/my-repo',
  defaultBranch: 'main',
});
```

## Initialize a Repository

Create a new Git repository:

```typescript
await git.init();
console.log('Repository initialized!');
```

## Add Files

Create and stage some files:

```typescript
// Write a file to the filesystem
await fs.writeFile(
  '/my-repo/README.md',
  '# My Project\n\nHello World!',
  'utf8',
);

// Stage the file
await git.add('README.md');
console.log('File staged!');
```

## Commit Changes

Create your first commit:

```typescript
const commitHash = await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

console.log('Created commit:', commitHash);
```

## Check Status

View the working tree status:

```typescript
const status = await git.status('README.md');
console.log('File status:', status);
```

## View History

See your commit history:

```typescript
const commits = await git.log();
console.log('Commits:', commits);
```

## Complete Example

Here's the complete code:

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

async function main() {
  // Setup
  const fs = new MemoryFSAdapter();
  const git = new GitClient({ fs, dir: '/my-repo', defaultBranch: 'main' });

  // Initialize
  await git.init();

  // Create and stage a file
  await fs.writeFile('/my-repo/README.md', '# My Project', 'utf8');
  await git.add('README.md');

  // Commit
  const hash = await git.commit('Initial commit', {
    name: 'John Doe',
    email: 'john@example.com',
  });

  console.log('Created commit:', hash);

  // View history
  const commits = await git.log();
  console.log('History:', commits);
}

main();
```

## Next Steps

- [Commands](/commands/init/) - Learn about all available commands
- [Filesystem Adapters](/filesystem/overview/) - Explore different storage options
