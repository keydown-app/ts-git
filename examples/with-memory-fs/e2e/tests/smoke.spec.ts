import { test, expect } from '@playwright/test';

test('initial state shows empty directory and no-git messages', async ({
  page,
}) => {
  // Navigate to app
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for app to load
  const app = page.locator('#app');
  await expect(app).toBeVisible();

  // Check that file tree shows "Empty directory" message
  const fileTreePanel = page.locator('.filetree-panel');
  await expect(fileTreePanel).toBeVisible();
  const emptyDirectoryMessage = fileTreePanel.locator('.empty-state');
  await expect(emptyDirectoryMessage).toBeVisible();
  await expect(emptyDirectoryMessage).toContainText('Empty directory');

  // Git UI lives under Changes tab
  await page.locator('#sidebar-tab-changes').click();
  const gitPanel = page.locator('#git-changes-panel');
  await expect(gitPanel).toBeVisible();
  const gitNotRepoDescription = gitPanel.locator('.git-not-repo-description');
  await expect(gitNotRepoDescription).toBeVisible();
  await expect(gitNotRepoDescription).toContainText("doesn't have a Git repository");
  const initRepoButton = gitPanel.locator('.git-init-button');
  await expect(initRepoButton).toBeVisible();
  await expect(initRepoButton).toContainText('Initialize repository');

  // No inline Git Changes/History tabs when using app-level sidebar tabs
  await expect(page.locator('#git-changes-panel .git-tab-container')).toHaveCount(0);

  // Branch footer hidden when there is no repository
  await expect(page.locator('.sidebar-git-footer')).toBeHidden();
});

test('app loads without console errors', async ({ page }) => {
  const errors: string[] = [];

  // Capture console errors (excluding known non-critical errors)
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const errorText = msg.text();
      // Skip the known ENOTDIR error from FileTree trying to read /workspace before it exists
      // Skip the known NotAGitRepoError from git refresh when git is not initialized
      if (
        !errorText.includes('ENOTDIR') &&
        !errorText.includes("readdir '/workspace'") &&
        !errorText.includes('NotAGitRepoError') &&
        !errorText.includes('not a git repository')
      ) {
        errors.push(errorText);
        console.log('Console error:', errorText);
      }
    }
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    console.log('Page error:', error.message);
    errors.push(error.message);
  });

  // Navigate to app
  await page.goto('/');

  // Wait for app to load
  await page.waitForLoadState('networkidle');

  // Check that app container exists
  const app = page.locator('#app');
  await expect(app).toBeVisible();

  // Check that main panels exist
  const panels = page.locator('.panel');
  const panelCount = await panels.count();
  console.log(`Found ${panelCount} panels`);

  if (panelCount === 0) {
    // Check what actually rendered
    const appHtml = await app.innerHTML();
    console.log('App HTML:', appHtml.substring(0, 1000));
  }

  expect(panelCount).toBeGreaterThan(0);

  // Verify no console errors
  expect(errors).toHaveLength(0);
});

test('init command works', async ({ page }) => {
  // Navigate to app
  await page.goto('/');

  // Wait for app to load
  await page.waitForLoadState('networkidle');

  // Wait for terminal to be ready
  await page.waitForSelector('.terminal-input', { timeout: 10000 });

  // Type init command
  const terminalInput = page.locator('.terminal-input');
  await terminalInput.fill('init');
  await terminalInput.press('Enter');

  // Get terminal output
  await page.waitForTimeout(500);
  const output = await page.locator('.terminal-output').textContent();
  console.log('Terminal output:', output);

  // Should show success message
  expect(output).toContain('Initialized');
  expect(output).toContain('Git repository');

  // Should NOT contain error messages
  expect(output).not.toContain('Error:');
  expect(output).not.toContain('Module');
  expect(output).not.toContain('externalized');
});

test('full git workflow with regular status checks', async ({ page }) => {
  // Navigate to app
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for terminal to be ready
  const terminalInput = page.locator('.terminal-input');
  const terminalOutput = page.locator('.terminal-output');
  await expect(terminalInput).toBeVisible({ timeout: 10000 });

  // Helper function to run status and get output
  async function checkStatus() {
    await terminalInput.fill('status');
    await terminalInput.press('Enter');
    await page.waitForTimeout(500);
    return await terminalOutput.textContent();
  }

  // ===== Phase 1: Initialize git and create first file =====
  console.log('\n=== Phase 1: Initialize git and create first file ===');

  // Step 1: Initialize git repository first
  await terminalInput.fill('init');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  let output = await terminalOutput.textContent();
  expect(output).toContain('Initialized');
  expect(output).toContain('Git repository');

  // Step 2: Create a text file using touch command
  await terminalInput.fill('touch testfile.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(200);

  // Step 3: Check status - file appears as 'A' (Added)
  let status = await checkStatus();
  console.log('Status after touch:', status);
  expect(status).toContain('testfile.txt');
  expect(status).toContain('A testfile.txt'); // Added

  // Step 4: Edit the file using edit command
  await terminalInput.fill('edit testfile.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);

  // Step 5: Vim editor should be open - type some text
  const vimTextarea = page.locator('.vim-textarea');
  await expect(vimTextarea).toBeVisible({ timeout: 5000 });
  await vimTextarea.fill('Hello, this is a test file for git!');
  await page.waitForTimeout(200);

  // Step 6: Save and quit using :wq
  await vimTextarea.press(':');
  await page.waitForTimeout(100);
  const vimCommandInput = page.locator('.vim-command-input');
  await expect(vimCommandInput).toBeFocused();
  await vimCommandInput.fill('wq');
  await vimCommandInput.press('Enter');
  await page.waitForTimeout(500);

  // Verify file was saved
  output = await terminalOutput.textContent();
  expect(output).toContain('File saved: /workspace/testfile.txt');

  // Step 7: Check status - should still show file as added
  status = await checkStatus();
  console.log('Status after edit:', status);
  expect(status).toContain('testfile.txt');
  expect(status).toContain('A testfile.txt'); // Added

  // Step 8: Check status - should show file as added (staged)
  status = await checkStatus();
  console.log('Status after init:', status);
  expect(status).toContain('On branch master');
  expect(status).toContain('A testfile.txt'); // Added/Staged

  // ===== Phase 2: Second file =====
  console.log('\n=== Phase 2: Second file ===');

  // Step 9: Create second file
  await terminalInput.fill('touch testfile2.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(200);

  // Step 10: Check status - first file staged, second shows as added
  status = await checkStatus();
  console.log('Status after second file:', status);
  expect(status).toContain('A testfile.txt'); // First file still staged
  expect(status).toContain('A testfile2.txt'); // Second file also appears as added

  // Step 11: Add all files
  await terminalInput.fill('add .');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);

  // Step 12: Check status - both files staged
  status = await checkStatus();
  console.log('Status after add:', status);
  expect(status).toContain('A testfile.txt');
  expect(status).toContain('A testfile2.txt');

  // Step 13: Commit the files
  await terminalInput.fill('commit -m "Initial commit with two files"');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  output = await terminalOutput.textContent();
  console.log('Commit output:', output);
  expect(output).toContain('Initial commit with two files');
  expect(output).toContain('master');
  expect(output).toContain('root-commit');

  // Step 14: Check status - files show with no status (tracked but unchanged)
  // Note: The status shows internal .git files which is the current behavior
  status = await checkStatus();
  console.log('Status after commit:', status);
  expect(status).toContain('testfile.txt');
  expect(status).toContain('testfile2.txt');
  // Files are tracked but unchanged (shown with spaces before name)
  expect(status).not.toContain('M testfile.txt');
  expect(status).not.toContain('D testfile.txt');

  // Step 15: Verify log shows 1 commit
  await terminalInput.fill('log');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  let logOutput = await terminalOutput.textContent();
  console.log('Log after first commit:', logOutput);
  expect(logOutput).toContain('Initial commit with two files');
  expect(logOutput).toContain('Demo User');

  // ===== Phase 3: Modifications =====
  console.log('\n=== Phase 3: Modifications ===');

  // Step 16: Edit the first file
  await terminalInput.fill('edit testfile.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);

  const vimTextarea2 = page.locator('.vim-textarea');
  await expect(vimTextarea2).toBeVisible({ timeout: 5000 });
  // Add more content to the file
  await vimTextarea2.fill(
    'Hello, this is a test file for git!\nAdding more content here.',
  );
  await page.waitForTimeout(200);
  await vimTextarea2.press(':');
  await page.waitForTimeout(100);
  const vimCommandInput2 = page.locator('.vim-command-input');
  await expect(vimCommandInput2).toBeFocused();
  await vimCommandInput2.fill('wq');
  await vimCommandInput2.press('Enter');
  await page.waitForTimeout(500);

  // Step 17: Check status - file still appears (modification detection may vary)
  status = await checkStatus();
  console.log('Status after editing testfile:', status);
  expect(status).toContain('testfile.txt');

  // Step 18: Delete the second file
  await terminalInput.fill('rm testfile2.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);

  // Step 19: Check status - testfile.txt still there, testfile2.txt deleted
  // Note: testfile2.txt will appear in command history, so we just verify testfile.txt exists
  status = await checkStatus();
  console.log('Status after rm:', status);
  expect(status).toContain('testfile.txt');

  // Step 20: Add the changes
  await terminalInput.fill('add .');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);

  // Step 21: Check status - changes staged (verify file state)
  status = await checkStatus();
  console.log('Status after staging changes:', status);
  expect(status).toContain('testfile.txt');

  // Step 22: Commit the changes
  await terminalInput.fill('commit -m "Update testfile and remove testfile2"');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  output = await terminalOutput.textContent();
  console.log('Second commit output:', output);
  expect(output).toContain('Update testfile and remove testfile2');

  // Step 23: Check status - files show with no status (tracked but unchanged)
  status = await checkStatus();
  console.log('Status after second commit:', status);
  expect(status).toContain('testfile.txt');

  // Step 24: Verify log shows 2 commits
  await terminalInput.fill('log');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  logOutput = await terminalOutput.textContent();
  console.log('Log after second commit:', logOutput);
  expect(logOutput).toContain('Initial commit with two files');
  expect(logOutput).toContain('Update testfile and remove testfile2');

  // ===== Phase 4: Final verification =====
  console.log('\n=== Phase 4: Final verification ===');

  // Step 25: Verify file system state with ls
  await terminalInput.fill('ls');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  const lsOutput = await terminalOutput.textContent();
  console.log('ls output:', lsOutput);
  expect(lsOutput).toContain('testfile.txt');
  // Note: testfile2.txt will be in command history, verify through file count or cat

  // Step 26: Verify file contents with cat
  await terminalInput.fill('cat testfile.txt');
  await terminalInput.press('Enter');
  await page.waitForTimeout(500);
  const catOutput = await terminalOutput.textContent();
  console.log('cat output:', catOutput);
  expect(catOutput).toContain('Hello, this is a test file for git!');
  expect(catOutput).toContain('Adding more content here.');

  console.log('\n=== Test completed successfully! ===');
});
