/**
 * Commitlint Configuration
 *
 * Enforces conventional commit message format:
 * <type>(<scope>): <subject>
 *
 * Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Code style changes (formatting, etc.)
        'refactor', // Code refactoring
        'perf', // Performance improvements
        'test', // Test changes
        'build', // Build system changes
        'ci', // CI/CD changes
        'chore', // Other changes
        'revert', // Revert a commit
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-case': [0], // Allow any case for subject
    'header-max-length': [2, 'always', 100],
  },
};
