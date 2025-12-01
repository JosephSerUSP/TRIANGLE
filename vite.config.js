import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    open: true
  },
  build: {
    target: 'esnext'
  }
});
