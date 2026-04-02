---
title: Roadmap & Limitations
description: Current state of TS-Git and future plans
---
TS-Git is currently in **alpha** and under active development. This page outlines what's currently implemented, what's planned, and known limitations.

## Current Status

### ✅ Implemented Commands

| Command    | Status      | Notes                                              |
| ---------- | ----------- | -------------------------------------------------- |
| `init`     | ✅ Complete | Initialize repositories with custom default branch |
| `add`      | ✅ Complete | Stage files individually or all at once            |
| `remove`   | ✅ Complete | Remove files from index                            |
| `commit`   | ✅ Complete | Create commits with author info                    |
| `status`   | ✅ Complete | Check working tree and staging area status         |
| `log`      | ✅ Complete | View commit history                                |
| `branch`   | ✅ Complete | Create, list, and delete branches                  |
| `checkout` | ✅ Complete | Switch between branches                            |
| `reset`    | ✅ Complete | Unstage files                                      |
| `diff`     | ✅ Complete | Show changes with multiple output formats          |

### ✅ Features

- **Pluggable filesystem adapters** - Memory, Node.js, Tauri, ZenFS, and custom adapters
- **TypeScript-first** - Fully typed API
- **Browser support** - Run Git operations in the browser
- **CLI interface** - Optional embedded terminal with CommandParser
- **Status matrix** - Detailed file status information
- **Multiple diff formats** - Patch, stat, name-only, name-status

## 🚧 In Progress / Planned

### Remote Operations

These require network layer implementation:

- `clone` - Clone remote repositories
- `fetch` - Download objects from remote
- `pull` - Fetch and merge
- `push` - Update remote refs
- `remote` - Manage tracked repositories

### Advanced Features

- `merge` - Join development histories
- `rebase` - Reapply commits on top of another base
- `cherry-pick` - Apply changes from specific commits
- `stash` - Stash changes
- `tag` - Create, list, or delete tags
- `config` - Get/set repository options
- `show` - Show various types of objects

## Known Limitations

### Index Format

- **Index version 4** is not supported; use Git index version 2 or 3
- Unmerged (multi-stage) index entries have limited support

### Diff Limitations

- **Rename detection** (`-M`, `-C`) - Files moved or copied appear as separate deletions and additions
- **Merge-base diffs** (`--merge-base`, `A...B` syntax) - Triple-dot notation not supported
- **Binary files** - Detected but content diffing is limited
- **No-index mode** (`--no-index`) - Comparing paths outside a git repository not supported
- **Range notation** (`A^!`, `A^@`) - Special revision range syntaxes not supported
- **Word diff** (`--word-diff`) - Word-level diffs not supported
- **Color output** - ANSI color codes not supported

### Other Limitations

- **Conflict resolution** - Full conflict semantics not implemented
- **Submodules** - Not supported
- **Hooks** - Git hooks not supported
- **Signed commits** - GPG signing not supported

## Future Roadmap

### Phase 1: Core Stability (Current)

- [x] Basic repository operations
- [x] Branching and merging basics
- [x] File operations
- [x] Diff and status

### Phase 2: Remote Support

- [ ] HTTP(S) transport
- [ ] Clone and fetch
- [ ] Push operations
- [ ] Remote management

### Phase 3: Advanced Features

- [ ] Merge strategies
- [ ] Rebase
- [ ] Cherry-pick
- [ ] Stash
- [ ] Tags

### Phase 4: Performance & Polish

- [ ] Packfile optimization
- [ ] Delta compression
- [ ] Streaming for large files
- [ ] Better conflict handling

## Contributing

TS-Git is open source and contributions are welcome! Check out the [GitHub repository](https://github.com/keydown-app/ts-git) to:

- Report issues
- Suggest features
- Submit pull requests

## API Stability

⚠️ **Warning**: As this is alpha software, APIs may change. We follow semver and will document breaking changes in release notes.
