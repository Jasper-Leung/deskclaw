import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules', 'dist-electron', 'next/.next', 'release'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist-electron/',
        'next/.next/',
        'release/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/types/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './electron/main'),
      '@next': path.resolve(__dirname, './next'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
