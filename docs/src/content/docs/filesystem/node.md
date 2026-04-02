---
title: NodeFSAdapter
description: Node.js native filesystem adapter
---
The `NodeFSAdapter` provides access to the native Node.js filesystem, enabling persistent storage on disk.

## Usage

```typescript
import { GitClient, NodeFSAdapter } from '@keydown-app/ts-git';

const fs = new NodeFSAdapter();
const git = new GitClient({ fs, dir: './my-repo' });

await git.init();
```

## When to Use

- **Server Applications** - Node.js backends and APIs
- **CLI Tools** - Command-line applications
- **Scripts** - Automation and build scripts
- **Desktop Apps** - Electron or similar Node.js-based apps

## Example

```typescript
import { GitClient, NodeFSAdapter } from '@keydown-app/ts-git';
import * as nodeFs from 'fs';

async function createRepo() {
  const fs = new NodeFSAdapter();
  const git = new GitClient({
    fs,
    dir: './my-project',
    defaultBranch: 'main',
  });

  // Create directory if it doesn't exist
  if (!nodeFs.existsSync('./my-project')) {
    nodeFs.mkdirSync('./my-project', { recursive: true });
  }

  // Initialize repository
  await git.init();
  console.log('Repository initialized at ./my-project/.git');

  // Create a file using Node.js fs
  nodeFs.writeFileSync(
    './my-project/README.md',
    '# My Project\n\nDescription here.',
    'utf8',
  );

  // Stage and commit using TS-Git
  await git.add('README.md');

  const hash = await git.commit('Initial commit', {
    name: 'Developer',
    email: 'dev@example.com',
  });

  console.log('Created commit:', hash);

  // Verify with git log
  const commits = await git.log();
  console.log('Total commits:', commits.length);
}

createRepo().catch(console.error);
```

## Working with Existing Repositories

```typescript
import { GitClient, NodeFSAdapter } from '@keydown-app/ts-git';

async function openExistingRepo() {
  const fs = new NodeFSAdapter();
  const git = new GitClient({ fs, dir: './existing-repo' });

  // Check if it's a git repository
  const isRepo = await git.isGitRepository();

  if (!isRepo) {
    console.error('Not a git repository');
    return;
  }

  // View history
  const commits = await git.log(5);
  console.log('Recent commits:');
  commits.forEach((c) => {
    console.log(`- ${c.oid.slice(0, 7)}: ${c.commit.message}`);
  });

  // Check status
  const matrix = await git.statusMatrix();
  const changed = matrix.filter((row) => row[2] !== 1);
  console.log(`Changed files: ${changed.length}`);
}

openExistingRepo().catch(console.error);
```

## Path Handling

The `NodeFSAdapter` works with standard Node.js paths:

```typescript
const git = new GitClient({
  fs: new NodeFSAdapter(),
  dir: '/absolute/path/to/repo', // Absolute path
});

// Or relative
const git2 = new GitClient({
  fs: new NodeFSAdapter(),
  dir: './relative/path', // Relative to cwd
});
```

## See Also

- [MemoryFSAdapter](/filesystem/memory/) - In-memory storage
- [Creating Custom Adapters](/filesystem/custom/) - Build your own
