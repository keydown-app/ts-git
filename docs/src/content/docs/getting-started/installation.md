---
title: Installation
description: How to install TS-Git in your project
---
## npm

```bash
npm install @keydown-app/ts-git
```

## pnpm

```bash
pnpm add @keydown-app/ts-git
```

## yarn

```bash
yarn add @keydown-app/ts-git
```

## Optional Dependencies

### CLI Support

The package also exports an optional embedded terminal command surface:

```bash
npm install @keydown-app/ts-git
```

Then import the CLI components:

```typescript
import { CommandParser } from '@keydown-app/ts-git/cli';
```

### Diff Algorithm

For diff functionality, you'll need a line diff algorithm:

```bash
npm install @keydown-app/ts-git-diff-myers
```

Usage:

```typescript
import { myersLineDiff } from '@keydown-app/ts-git-diff-myers';
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const git = new GitClient({
  fs: new MemoryFSAdapter(),
  dir: '/my-repo',
  lineDiffAlgorithm: myersLineDiff,
});
```

## TypeScript Configuration

TS-Git is written in TypeScript and includes type definitions. No additional `@types` package is needed.

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2020"
  }
}
```

## Next Steps

- [Quick Start](/getting-started/quickstart/) - Create your first repository
