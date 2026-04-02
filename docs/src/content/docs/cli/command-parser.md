---
title: CommandParser
description: Embedded terminal CLI for TS-Git
---
TS-Git includes an optional embedded terminal command surface that provides a Git-like CLI experience.

## Installation

The CLI components are included in the main package:

```bash
npm install @keydown-app/ts-git
```

Import the CLI components:

```typescript
import { CommandParser } from '@keydown-app/ts-git/cli';
```

## CommandParser

The `CommandParser` provides a command-line interface to TS-Git operations.

```typescript
import { CommandParser, type CommandContext } from '@keydown-app/ts-git/cli';
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

const fs = new MemoryFSAdapter();
const git = new GitClient({ fs, dir: '/my-repo' });

// Create parser
const parser = new CommandParser(git);

// Execute a command
const result = await parser.execute('git status');
console.log(result);
```

## Custom Prompts

You can override prompts by providing a custom `CommandContext`:

```typescript
import type { CommandContext } from '@keydown-app/ts-git/cli';

const context: CommandContext = {
  // Custom prompt function
  prompt: async (message: string) => {
    // Your custom prompt implementation
    return 'user input';
  },

  // Custom confirm function
  confirm: async (message: string) => {
    // Your custom confirm implementation
    return true;
  },

  // Custom copy function for output
  copy: (text: string) => {
    // Copy to clipboard or other destination
    navigator.clipboard.writeText(text);
  },

  // Output function
  output: (text: string) => {
    console.log(text);
  },
};

const parser = new CommandParser(git, context);
```

### CommandContext Interface

```typescript
interface CommandContext {
  /** Prompt for user input */
  prompt: (message: string) => Promise<string>;

  /** Ask for confirmation */
  confirm: (message: string) => Promise<boolean>;

  /** Copy text to clipboard */
  copy: (text: string) => void;

  /** Output text to display */
  output: (text: string) => void;
}
```

## Example: Web Terminal

```typescript
import { CommandParser, type CommandContext } from '@keydown-app/ts-git/cli';
import { GitClient, MemoryFSAdapter } from '@keydown-app/ts-git';

class WebTerminal {
  private git: GitClient;
  private parser: CommandParser;
  private output: string[] = [];

  constructor() {
    const fs = new MemoryFSAdapter();
    this.git = new GitClient({ fs, dir: '/workspace' });

    const context: CommandContext = {
      prompt: async (msg) => {
        // Show prompt in UI and wait for input
        return window.prompt(msg) || '';
      },

      confirm: async (msg) => {
        return window.confirm(msg);
      },

      copy: (text) => {
        navigator.clipboard.writeText(text);
      },

      output: (text) => {
        this.output.push(text);
        this.render();
      },
    };

    this.parser = new CommandParser(this.git, context);
  }

  async execute(command: string) {
    this.output.push(`$ ${command}`);
    try {
      await this.parser.execute(command);
    } catch (error) {
      this.output.push(`Error: ${error}`);
    }
    this.render();
  }

  private render() {
    // Update your terminal UI
    console.log(this.output.join('\n'));
  }
}

// Usage
const terminal = new WebTerminal();
await terminal.execute('git init');
await terminal.execute('git add README.md');
await terminal.execute('git commit -m "Initial commit"');
```

## Supported Commands

The CommandParser supports standard Git commands:

| Command    | Description              |
| ---------- | ------------------------ |
| `init`     | Initialize repository    |
| `add`      | Stage files              |
| `rm`       | Remove files from index  |
| `commit`   | Create commit            |
| `status`   | Show working tree status |
| `log`      | Show commit history      |
| `branch`   | Manage branches          |
| `checkout` | Switch branches          |
| `reset`    | Unstage files            |
| `diff`     | Show differences         |

## See Also

- [Getting Started](/getting-started/quickstart/) - Basic TS-Git usage
