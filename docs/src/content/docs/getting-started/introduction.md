---
title: Introduction
description: Local-only TypeScript Git implementation with pluggable filesystem support
---
TS-Git is a pure TypeScript implementation of Git that runs entirely in the browser or Node.js environment. It provides a Git-compatible API with pluggable filesystem adapters, allowing you to work with Git repositories using various storage backends.

## Key Features

- 🔧 **Pluggable Filesystem** - Works with in-memory, browser storage, or native filesystems
- 📦 **Zero Dependencies** - Lightweight implementation with minimal external dependencies
- 🧪 **Well Tested** - Comprehensive test suite with 470+ tests
- 🌐 **Browser Native** - Run Git operations directly in the browser
- 💪 **Type Safe** - Fully typed with TypeScript

## Installation

```bash
npm install @keydown-app/ts-git
```

## Quick Example

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

// Create a filesystem adapter (in-memory for this example)
const fs = new MemoryFSAdapter();

// Initialize Git client
const git = new GitClient({ fs, dir: '/my-repo' });

// Initialize a repository
await git.init({ defaultBranch: 'main' });

// Stage and commit files
await git.add('README.md');
await git.commit('Initial commit', {
  name: 'John Doe',
  email: 'john@example.com',
});

// View commit history
const commits = await git.log();
```

## Supported Commands

| Command    | Status       | Description                                 |
| ---------- | ------------ | ------------------------------------------- |
| `init`     | ✅ Supported | Initialize a new Git repository             |
| `add`      | ✅ Supported | Stage file(s) for commit                    |
| `rm`       | ✅ Supported | Remove file(s) from index                   |
| `commit`   | ✅ Supported | Create a new commit                         |
| `status`   | ✅ Supported | Show working tree status                    |
| `log`      | ✅ Supported | Show commit history                         |
| `branch`   | ✅ Supported | List, create, or delete branches            |
| `checkout` | ✅ Supported | Switch branches                             |
| `reset`    | ✅ Supported | Unstage file(s)                             |
| `diff`     | ✅ Supported | Show changes between commits/index/worktree |

## Next Steps

- [Installation](/getting-started/installation/) - Install TS-Git in your project
- [Quick Start](/getting-started/quickstart/) - Your first TS-Git workflow
- [Commands](/commands/init/) - Explore the available Git commands
