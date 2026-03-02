import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude dist folder to avoid running compiled tests twice
    exclude: ['dist', 'node_modules'],
  },
});
