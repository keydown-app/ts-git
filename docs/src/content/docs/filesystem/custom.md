---
title: Creating Custom Adapters
description: Build your own filesystem adapter for TS-Git
---
You can create custom filesystem adapters to integrate TS-Git with any storage backend.

## FSAdapter Interface

Implement the `FSAdapter` interface:

```typescript
import type { FSAdapter, DirEntry, FileStats } from '@keydown-app/ts-git';

export interface FSAdapter {
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  writeFile(
    path: string,
    data: string | Uint8Array,
    encoding?: string,
  ): Promise<void>;
  readdir(path: string): Promise<DirEntry[]>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<FileStats>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
}

export interface DirEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FileStats {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtime: Date;
}
```

## Example: LocalStorage Adapter

Here's an example adapter using browser's LocalStorage:

```typescript
import type { FSAdapter, DirEntry, FileStats } from '@keydown-app/ts-git';

export class LocalStorageAdapter implements FSAdapter {
  private prefix: string;

  constructor(prefix = 'ts-git-fs:') {
    this.prefix = prefix;
  }

  private key(path: string): string {
    return this.prefix + path;
  }

  async readFile(
    path: string,
    encoding?: string,
  ): Promise<string | Uint8Array> {
    const data = localStorage.getItem(this.key(path));
    if (data === null) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return encoding === 'utf8' ? data : new TextEncoder().encode(data);
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const content =
      typeof data === 'string' ? data : new TextDecoder().decode(data);
    localStorage.setItem(this.key(path), content);
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const entries: DirEntry[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        const relativePath = key.slice(this.prefix.length);
        const parts = relativePath.split('/').filter(Boolean);

        if (parts.length > 0 && relativePath.startsWith(path)) {
          const name = parts[path === '/' ? 0 : parts.length - 1];
          if (!seen.has(name)) {
            seen.add(name);
            entries.push({
              name,
              isDirectory: () => false, // Simplified
              isFile: () => true,
            });
          }
        }
      }
    }

    return entries;
  }

  async mkdir(path: string): Promise<void> {
    // LocalStorage doesn't have directories
    // Could store a marker if needed
  }

  async stat(path: string): Promise<FileStats> {
    const data = localStorage.getItem(this.key(path));
    if (data === null) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    return {
      isDirectory: () => false,
      isFile: () => true,
      size: data.length,
      mtime: new Date(),
    };
  }

  async exists(path: string): Promise<boolean> {
    return localStorage.getItem(this.key(path)) !== null;
  }

  async unlink(path: string): Promise<void> {
    localStorage.removeItem(this.key(path));
  }

  async rmdir(path: string): Promise<void> {
    // Remove all items under this path
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix + path)) {
        localStorage.removeItem(key);
      }
    }
  }
}
```

## Usage

```typescript
import { GitClient } from '@keydown-app/ts-git';
import { LocalStorageAdapter } from './LocalStorageAdapter';

const fs = new LocalStorageAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

await git.init();
```

## Testing Your Adapter

```typescript
async function testAdapter(adapter: FSAdapter) {
  // Write and read
  await adapter.writeFile('/test.txt', 'Hello World', 'utf8');
  const content = await adapter.readFile('/test.txt', 'utf8');
  console.assert(content === 'Hello World');

  // Exists
  const exists = await adapter.exists('/test.txt');
  console.assert(exists === true);

  // Stat
  const stats = await adapter.stat('/test.txt');
  console.assert(stats.isFile() === true);
  console.assert(stats.size === 11);

  // Delete
  await adapter.unlink('/test.txt');
  const existsAfter = await adapter.exists('/test.txt');
  console.assert(existsAfter === false);

  console.log('All tests passed!');
}
```

## Tips

1. **Error Messages** - Match Node.js fs error messages for compatibility
2. **Encoding** - Handle both string and Uint8Array data
3. **Paths** - Normalize paths (e.g., `/dir//file` → `/dir/file`)
4. **Directories** - Decide if your storage has real directories or just prefixes
5. **Async** - All methods must return Promises

## See Also

- [MemoryFSAdapter](/filesystem/memory/) - Reference implementation
- [NodeFSAdapter](/filesystem/node/) - Native filesystem
