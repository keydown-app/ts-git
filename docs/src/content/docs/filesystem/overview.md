---
title: Overview
description: Pluggable filesystem adapters for TS-Git
---
TS-Git uses a pluggable filesystem adapter architecture, allowing it to work with various storage backends.

## What is a Filesystem Adapter?

A filesystem adapter is an implementation of the `FSAdapter` interface that provides file system operations. This abstraction allows TS-Git to work in different environments:

- **Browser**: Use in-memory or IndexedDB storage
- **Node.js**: Use the native filesystem
- **Desktop (Tauri)**: Use the native filesystem via Tauri APIs
- **Custom**: Create your own adapter for any storage backend

## Available Adapters

### MemoryFSAdapter

In-memory filesystem - perfect for testing and ephemeral storage.

```typescript
import { MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
```

- Data is stored in memory
- Fast but not persistent
- Great for unit tests

### NodeFSAdapter

Native Node.js filesystem for server-side applications.

```typescript
import { NodeFSAdapter } from '@keydown-app/ts-git';

const fs = new NodeFSAdapter();
```

- Uses Node.js `fs` module
- Persistent storage on disk
- For Node.js environments only

### Other Adapters

The TS-Git ecosystem includes additional adapters:

- **TauriFSAdapter** - For Tauri desktop applications
- **ZenFSAdapter** - Browser-based persistent storage
- **FileSystemAccessAdapter** - Native File System Access API

## Using an Adapter

```typescript
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

// Create adapter
const fs = new MemoryFSAdapter();

// Pass to GitClient
const git = new GitClient({
  fs,
  dir: '/my-repo',
});

// Use normally
await git.init();
```

## Creating Custom Adapters

You can create your own filesystem adapter by implementing the `FSAdapter` interface:

```typescript
import type { FSAdapter, DirEntry, FileStats } from '@keydown-app/ts-git';

class MyCustomAdapter implements FSAdapter {
  async readFile(
    path: string,
    encoding?: string,
  ): Promise<string | Uint8Array> {
    // Implementation
  }

  async writeFile(
    path: string,
    data: string | Uint8Array,
    encoding?: string,
  ): Promise<void> {
    // Implementation
  }

  async readdir(path: string): Promise<DirEntry[]> {
    // Implementation
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    // Implementation
  }

  async stat(path: string): Promise<FileStats> {
    // Implementation
  }

  async exists(path: string): Promise<boolean> {
    // Implementation
  }

  async unlink(path: string): Promise<void> {
    // Implementation
  }

  async rmdir(path: string): Promise<void> {
    // Implementation
  }
}
```

## Adapter Selection Guide

| Environment    | Adapter           | Persistent      |
| -------------- | ----------------- | --------------- |
| Testing        | `MemoryFSAdapter` | No              |
| Node.js        | `NodeFSAdapter`   | Yes             |
| Browser (dev)  | `MemoryFSAdapter` | No              |
| Browser (prod) | `ZenFSAdapter`    | Yes (IndexedDB) |
| Tauri Desktop  | `TauriFSAdapter`  | Yes             |

## Next Steps

- [MemoryFSAdapter](/filesystem/memory/) - In-memory storage
- [NodeFSAdapter](/filesystem/node/) - Node.js filesystem
- [Creating Custom Adapters](/filesystem/custom/) - Build your own
