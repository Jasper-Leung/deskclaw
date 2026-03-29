import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import next from '@next/eslint-plugin-next';
import globals from 'globals';

export default [
  // Ignore files
  {
    ignores: [
      'node_modules/**',
      'dist-electron/**',
      'next/.next/**',
      'next/out/**',
      'next/next-env.d.ts',
      'release/**',
      'coverage/**',
      '*.log',
      'logs/**',
      '.DS_Store',
      'Thumbs.db',
      '.env',
      '.env.local',
      // Compiled JavaScript files from TypeScript
      'electron/**/*.js',
      'next/**/*.js',
      // Temporary test and build script files
      'test-*.js',
      'test-*.cjs',
      'scripts/*.js',
      'scripts/*.bat',
      'fix-html-paths.js',
      'next/server-dev.js',
      'electron/main/db/*.json',
    ],
  },
  // Base JS config
  js.configs.recommended,
  // TypeScript config for Electron (with project for source files only)
  ...tseslint.configs.recommended,
  {
    files: ['electron/**/*.ts', 'shared/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/*.examples.ts', '**/*.examples.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
  // TypeScript config for Next.js (with its own tsconfig)
  {
    files: ['next/**/*.ts', 'next/**/*.tsx'],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.examples.ts',
      '**/*.examples.js',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './next/tsconfig.json',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
  // TypeScript config files (without project)
  {
    files: [
      '*.config.ts',
      '*.config.mjs',
      '*.config.js',
      'next/tailwind.config.ts',
      'next/next.config.js',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
  // Root .mjs and .js build files (Node.js environment)
  {
    files: ['*.mjs', '*.js'],
    ignores: ['next/**', 'electron/**', 'browser-extension/**', '*.config.*'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
  // React config
  {
    files: ['**/*.jsx', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@next/next': next,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'warn',
      '@next/next/no-html-link-for-pages': 'off', // Using App Router, not Pages Router
      'react/no-unescaped-entities': 'off', // Disable for JSX attributes like id="true"/id="false"
    },
  },
  // React hooks for .ts files in Next.js (hooks can be used in .ts files)
  {
    files: ['next/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './next/tsconfig.json',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': next,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off', // Using App Router, not Pages Router
    },
  },
  // Test files (more lenient rules)
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Example files (lenient rules for demonstration code)
  {
    files: ['**/*.examples.ts', '**/*.examples.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Browser extension files
  {
    files: ['browser-extension/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        browser: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
  // Common rules for all files (must be last so it can override specific configs)
  {
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
