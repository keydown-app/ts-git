import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  server: {
    port: 3000,
  },
});
