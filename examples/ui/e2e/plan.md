# Playwright E2E Testing Plan for TS-Git ZenFS Example

## Overview

This plan outlines the end-to-end testing strategy for the TS-Git ZenFS browser example using Playwright. The tests will verify that the application loads without errors and that all git commands work as expected.

## Directory Structure

```
e2e/
├── fixtures/
│   └── test-utils.ts          # Shared helper functions
├── tests/
│   ├── smoke.spec.ts          # Application smoke tests
│   ├── git-init.spec.ts       # Repository initialization
│   ├── git-commands.spec.ts   # Basic git workflow
│   └── git-branch.spec.ts     # Branch operations
├── playwright.config.ts       # Playwright configuration
└── plan.md                   # This file
```

## Phase 1: Infrastructure Setup

### 1.1 Dependencies

Install Playwright:

```bash
npm install -D @playwright/test
npx playwright install chromium  # We only need Chromium for this project
```

### 1.2 Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### 1.3 Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // Sequential due to shared IndexedDB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for shared state
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // Capture console logs
    contextOptions: {
      logger: {
        isEnabled: () => true,
        log: (name, severity, message) => {
          if (severity === 'error' || severity === 'warning') {
            console.log(`[${severity}] ${message}`);
          }
        },
      },
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

## Phase 2: Test Utilities

Create `e2e/fixtures/test-utils.ts`:

```typescript
import { Page, expect } from '@playwright/test';

/**
 * Execute a command in the terminal and return the output
 */
export async function runCommand(page: Page, command: string): Promise<string> {
  // Find terminal input
  const terminalInput = page.locator('.terminal-input');
  await terminalInput.fill(command);
  await terminalInput.press('Enter');

  // Wait for command to complete
  await page.waitForTimeout(500);

  // Get output (last few lines)
  const output = await page
    .locator('.terminal-output .terminal-line')
    .last()
    .textContent();
  return output || '';
}

/**
 * Clear IndexedDB between tests
 */
export async function clearIndexedDB(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
}

/**
 * Wait for specific text in terminal output
 */
export async function waitForOutput(
  page: Page,
  expectedText: string,
  timeout = 5000,
): Promise<void> {
  await page
    .locator('.terminal-output')
    .getByText(expectedText)
    .waitFor({ timeout });
}

/**
 * Get current git status from the Git Panel
 */
export async function getGitStatus(page: Page): Promise<{
  clean: boolean;
  branch: string;
  files: string[];
}> {
  const branchText = await page.locator('.current-branch').textContent();
  const cleanIndicator = await page
    .locator('.clean-status')
    .isVisible()
    .catch(() => false);
  const fileItems = await page.locator('.file-item').allTextContents();

  return {
    clean: cleanIndicator,
    branch: branchText || 'unknown',
    files: fileItems,
  };
}

/**
 * Verify no console errors occurred
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.waitForLoadState('networkidle');

  if (errors.length > 0) {
    throw new Error(`Console errors detected:\n${errors.join('\n')}`);
  }
}

/**
 * Check if file exists in file tree
 */
export async function fileExistsInTree(
  page: Page,
  filename: string,
): Promise<boolean> {
  const fileLocator = page
    .locator('.filetree-row')
    .filter({ hasText: filename });
  return await fileLocator.isVisible();
}

/**
 * Create sample repository structure
 */
export async function createSampleRepo(page: Page): Promise<void> {
  await runCommand(page, 'git init');
  await waitForOutput(page, 'Initialized empty Git repository');

  await runCommand(page, 'mkdir src');
  await runCommand(page, 'touch src/master.ts');
  await runCommand(page, 'touch README.md');

  await runCommand(page, 'git add README.md');
  await waitForOutput(page, "Added 'README.md'");

  await runCommand(page, 'git commit -m "Initial commit"');
  await waitForOutput(page, 'Created commit:');
}
```

## Phase 3: Test Suites

### 3.1 Smoke Tests

Create `e2e/tests/smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { assertNoConsoleErrors } from '../fixtures/test-utils';

test.describe('Application Smoke Tests', () => {
  test('application loads without errors', async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Wait for app to initialize
    await page.waitForSelector('#app', { timeout: 10000 });

    // Verify no console errors
    await assertNoConsoleErrors(page);

    // Verify three panels are visible
    await expect(page.locator('.filetree-panel')).toBeVisible();
    await expect(page.locator('.terminal-panel')).toBeVisible();
    await expect(page.locator('.gitstate-panel')).toBeVisible();

    // Verify terminal prompt shows root
    const prompt = await page.locator('.terminal-prompt').textContent();
    expect(prompt).toContain('/');
  });

  test('bare git command shows help', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.terminal-input');

    // Type bare git command
    const terminalInput = page.locator('.terminal-input');
    await terminalInput.fill('git');
    await terminalInput.press('Enter');

    // Wait for help output
    await expect(page.locator('.terminal-output')).toContainText('usage: git');
    await expect(page.locator('.terminal-output')).toContainText('init');
    await expect(page.locator('.terminal-output')).toContainText('add');
    await expect(page.locator('.terminal-output')).toContainText('commit');
  });

  test('help command shows all available commands', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.terminal-input');

    const terminalInput = page.locator('.terminal-input');
    await terminalInput.fill('help');
    await terminalInput.press('Enter');

    // Verify help content
    await expect(page.locator('.terminal-output')).toContainText(
      'Available commands',
    );
    await expect(page.locator('.terminal-output')).toContainText('git init');
    await expect(page.locator('.terminal-output')).toContainText('git status');
    await expect(page.locator('.terminal-output')).toContainText('mkdir');
    await expect(page.locator('.terminal-output')).toContainText('ls');
  });
});
```

### 3.2 Git Init Tests

Create `e2e/tests/git-init.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  runCommand,
  waitForOutput,
  clearIndexedDB,
  getGitStatus,
} from '../fixtures/test-utils';

test.describe('Git Init Command', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.terminal-input');
    await clearIndexedDB(page);
  });

  test('initializes repository with default branch', async ({ page }) => {
    await runCommand(page, 'git init');
    await waitForOutput(
      page,
      "Initialized empty Git repository with default branch 'master'",
    );

    const status = await getGitStatus(page);
    expect(status.branch).toContain('master');
  });

  test('initializes repository with custom branch', async ({ page }) => {
    await runCommand(page, 'git init develop');
    await waitForOutput(
      page,
      "Initialized empty Git repository with default branch 'develop'",
    );

    const status = await getGitStatus(page);
    expect(status.branch).toContain('develop');
  });

  test('status shows clean working tree after init', async ({ page }) => {
    await runCommand(page, 'git init');
    await waitForOutput(page, 'Initialized');

    await runCommand(page, 'git status');
    await waitForOutput(page, 'Working tree clean');

    const status = await getGitStatus(page);
    expect(status.clean).toBe(true);
  });
});
```

### 3.3 Git Commands Tests

Create `e2e/tests/git-commands.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  runCommand,
  waitForOutput,
  clearIndexedDB,
  getGitStatus,
  createSampleRepo,
} from '../fixtures/test-utils';

test.describe('Git Workflow Commands', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.terminal-input');
    await clearIndexedDB(page);
    await createSampleRepo(page);
  });

  test('add stages files', async ({ page }) => {
    await runCommand(page, 'touch newfile.txt');
    await runCommand(page, 'git add newfile.txt');

    await waitForOutput(page, "Added 'newfile.txt'");

    // Verify file is staged
    await runCommand(page, 'git status');
    const output = await page.locator('.terminal-output').textContent();
    expect(output).toContain('A'); // Added status
  });

  test('commit creates commit with message', async ({ page }) => {
    await runCommand(page, 'touch test.txt');
    await runCommand(page, 'git add test.txt');
    await runCommand(page, 'git commit -m "Add test file"');

    await waitForOutput(page, 'Created commit:');

    // Verify in log
    await runCommand(page, 'git log');
    await waitForOutput(page, 'Add test file');
  });

  test('status shows modified files', async ({ page }) => {
    // Create and modify a file
    await runCommand(page, 'echo "modified" > README.md');

    await runCommand(page, 'git status');
    await waitForOutput(page, 'M'); // Modified
  });

  test('log shows commit history', async ({ page }) => {
    await runCommand(page, 'git log');

    // Should show at least one commit
    await waitForOutput(page, 'commit');
    await waitForOutput(page, 'Initial commit');
    await waitForOutput(page, 'Author:');
  });
});
```

### 3.4 Git Branch Tests

Create `e2e/tests/git-branch.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  runCommand,
  waitForOutput,
  clearIndexedDB,
  createSampleRepo,
  getGitStatus,
} from '../fixtures/test-utils';

test.describe('Git Branch Commands', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.terminal-input');
    await clearIndexedDB(page);
    await createSampleRepo(page);
  });

  test('lists current branch', async ({ page }) => {
    await runCommand(page, 'git branch');

    await waitForOutput(page, 'master');
    const output = await page.locator('.terminal-output').textContent();
    expect(output).toContain('* master'); // Current branch marked with *
  });

  test('creates new branch', async ({ page }) => {
    await runCommand(page, 'git branch feature');
    await waitForOutput(page, "Created branch 'feature'");

    // Verify branch exists
    await runCommand(page, 'git branch');
    await waitForOutput(page, 'feature');
  });

  test('switches to branch', async ({ page }) => {
    await runCommand(page, 'git branch feature');
    await runCommand(page, 'git checkout feature');

    await waitForOutput(page, "Switched to branch 'feature'");

    const status = await getGitStatus(page);
    expect(status.branch).toContain('feature');
  });

  test('commits on different branches are isolated', async ({ page }) => {
    // Create feature branch
    await runCommand(page, 'git branch feature');
    await runCommand(page, 'git checkout feature');

    // Add file on feature branch
    await runCommand(page, 'touch feature-file.txt');
    await runCommand(page, 'git add feature-file.txt');
    await runCommand(page, 'git commit -m "Feature commit"');

    // Switch back to master
    await runCommand(page, 'git checkout master');

    // Verify feature commit is not on master
    await runCommand(page, 'git log');
    const output = await page.locator('.terminal-output').textContent();
    expect(output).not.toContain('Feature commit');
  });
});
```

## Phase 4: Running Tests

### Local Development

```bash
# Run all tests
npm run test:e2e

# Run with UI mode for debugging
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/tests/smoke.spec.ts

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

### CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install
          cd examples/with-zen-fs
          npm install

      - name: Install Playwright
        run: |
          cd examples/with-zen-fs
          npx playwright install chromium

      - name: Run E2E tests
        run: |
          cd examples/with-zen-fs
          npm run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: examples/with-zen-fs/playwright-report/
```

## Phase 5: Test Data Management

### IndexedDB Isolation

Each test should start with a clean IndexedDB state:

```typescript
test.beforeEach(async ({ page }) => {
  await clearIndexedDB(page);
});
```

### Console Error Monitoring

All tests should verify no console errors:

```typescript
test.afterEach(async ({ page }) => {
  await assertNoConsoleErrors(page);
});
```

## Success Criteria

All tests must pass:

- ✓ Application loads without console errors
- ✓ All git commands (init, add, commit, status, log, branch, checkout) work
- ✓ Git panel updates correctly
- ✓ File tree reflects git status
- ✓ No IndexedDB state leaks between tests

## Notes

1. **Sequential Execution**: Tests must run sequentially due to shared IndexedDB
2. **Timeouts**: Allow extra time for IndexedDB operations
3. **Screenshots**: Captured automatically on failure
4. **Console Monitoring**: All errors and warnings logged
5. **Browser Support**: Currently testing Chromium only

## Future Enhancements

- [ ] Add Firefox and WebKit test projects
- [ ] Performance benchmarks
- [ ] Visual regression testing
- [ ] Mobile viewport testing
- [ ] Load testing with large repositories
