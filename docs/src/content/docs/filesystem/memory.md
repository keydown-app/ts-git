---
title: MemoryFSAdapter
description: In-memory filesystem adapter for testing
---
The `MemoryFSAdapter` provides an in-memory filesystem implementation. All data is stored in memory and is lost when the application restarts.

## Usage

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

await git.init();
```

## When to Use

- **Unit Testing** - Fast, isolated tests with no side effects
- **Development** - Quick prototyping without file system dependencies
- **Ephemeral Storage** - Temporary operations that don't need persistence

## Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

async function testGitOperations() {
  // Create a fresh in-memory filesystem
  const fs = new MemoryFSAdapter();
  const git = new GitClient({
    fs,
    dir: '/test-repo',
    defaultBranch: 'main',
  });

  // Initialize repository
  await git.init();

  // Create files
  await fs.writeFile('/test-repo/README.md', '# Test', 'utf8');
  await fs.mkdir('/test-repo/src', { recursive: true });
  await fs.writeFile('/test-repo/src/index.ts', 'export {}', 'utf8');

  // Git operations
  await git.add('README.md');
  await git.add('src/index.ts');

  const hash = await git.commit('Initial commit', {
    name: 'Test User',
    email: 'test@example.com',
  });

  console.log('Created commit:', hash);

  // Verify
  const commits = await git.log();
  console.assert(commits.length === 1);
  console.assert(commits[0].commit.message === 'Initial commit');
}

// Run test
testGitOperations().catch(console.error);
```

## Methods

The `MemoryFSAdapter` implements the `FSAdapter` interface:

| Method                             | Description             |
| ---------------------------------- | ----------------------- |
| `readFile(path, encoding?)`        | Read file contents      |
| `writeFile(path, data, encoding?)` | Write file contents     |
| `readdir(path)`                    | List directory contents |
| `mkdir(path, options?)`            | Create directory        |
| `stat(path)`                       | Get file statistics     |
| `exists(path)`                     | Check if path exists    |
| `unlink(path)`                     | Delete file             |
| `rmdir(path)`                      | Remove directory        |

## Limitations

- Data is not persisted across sessions
- Subject to memory constraints
- Not suitable for production use with large repositories

## See Also

- [NodeFSAdapter](/filesystem/node/) - Persistent filesystem
- [Creating Custom Adapters](/filesystem/custom/) - Build your own
