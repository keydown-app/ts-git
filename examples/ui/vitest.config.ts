import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    deps: {
      optimizer: {
        web: {
          include: ['ts-git'],
        },
      },
    },
  },
  resolve: {
    alias: {
      'ts-git': '../../packages/ts-git/src',
      'ts-git/fs': '../../packages/ts-git/src/fs',
      'ts-git/client': '../../packages/ts-git/src/client',
    },
  },
});
