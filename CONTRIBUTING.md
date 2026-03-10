# Contributing to DeskClaw

Thank you for your interest in contributing to DeskClaw! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 20+ (use `.nvmrc` for version management)
- npm or yarn package manager
- Git

### Setup

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/your-username/deskclaw.git
   cd deskclaw
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch Strategy

- `main` - Production branch
- `develop` - Development branch
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Critical production fixes
- `docs/*` - Documentation updates

### Creating a Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### Making Changes

1. Write code following our [coding standards](#coding-standards)
2. Add tests for new functionality
3. Ensure all tests pass: `npm test`
4. Run linter: `npm run lint:fix`
5. Format code: `npm run format`

## Coding Standards

### TypeScript

- Use TypeScript for all new files
- Avoid `any` types - use proper type definitions
- Define interfaces for complex objects
- Use shared types from `shared/types/`

### React Components

- Use functional components with hooks
- Follow React best practices
- Use memo for performance optimization:
  ```tsx
  export const MyComponent = memo(function MyComponent({ prop }) {
    // ...
  });
  ```

### Naming Conventions

- **Files**: kebab-case (`my-component.tsx`)
- **Components**: PascalCase (`MyComponent`)
- **Functions/Variables**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Types/Interfaces**: PascalCase (`UserConfig`)

### Code Organization

```typescript
// 1. Imports
import { foo } from 'bar';

// 2. Types
interface Props {}

// 3. Constants
const CONSTANT = 'value';

// 4. Component/Function
export function Component() {}

// 5. Exports
export { helper };
```

### Error Handling

- Use proper error types from `shared/types/common.ts`
- Always handle errors appropriately
- Log errors using the logger:
  ```typescript
  import { logger } from '@/lib/logger';
  logger.error('Error message', error);
  ```

## Testing Guidelines

### Unit Tests

- Test pure functions and utilities
- Mock external dependencies
- Aim for high coverage (>80%)

```typescript
describe('MyFunction', () => {
  it('should do something', () => {
    expect(myFunction(input)).toEqual(expected);
  });
});
```

### Integration Tests

- Test component interactions
- Test IPC communications
- Use test database fixtures

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes

### Examples

```bash
feat(workflow): add loop node for workflow automation
fix(ipc): resolve memory leak in channel handler
docs(readme): update installation instructions
perf(virtual-list): implement windowing for large lists
```

### Commit Hooks

Our project uses Husky to enforce commit conventions:

- **pre-commit**: Runs lint-staged to format and lint staged files
- **commit-msg**: Validates commit message format
- **pre-push**: Runs test suite

## Pull Request Process

### Before Submitting

1. Update documentation
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md (if applicable)

### Submitting a PR

1. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

2. Create pull request on GitHub
3. Fill out the PR template
4. Link related issues

### PR Review Process

- Automated checks must pass
- At least one approval required
- Address review feedback
  re the requested changes

### Merging

- Squash and merge to `develop`
- Delete feature branch after merge
- Update version if needed

## Getting Help

- Check existing [issues](https://github.com/your-username/deskclaw/issues)
- Start a [discussion](https://github.com/your-username/deskclaw/discussions)
- Read the [documentation](https://github.com/your-username/deskclaw/wiki)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
