import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
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

  // No webServer - start Tauri dev server manually before tests
  // Run: pnpm dev
  // Then: pnpm test:e2e
});
