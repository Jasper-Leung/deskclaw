# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.0+  | :white_check_mark: |
| 0.2.x   | :x:                |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please follow these steps:

1. **Do not create a public GitHub issue** - this would expose the vulnerability to the public
2. **Use GitHub Private Vulnerability Reporting** - click the "Report a vulnerability" button at the top of this page to submit a report privately
3. **Include as much information as possible**:
   - Steps to reproduce the vulnerability
   - Affected versions
   - Potential impact
   - Suggested fix (if you have one)
4. **Wait for confirmation** - we will acknowledge receipt within 48 hours
5. **Coordinate fix** - we will work with you to develop and test a fix
6. **Public disclosure** - we will publicly disclose the vulnerability after a fix is released

## Security Features

DeskClaw includes several security features by design:

### Core Security

- **Local-First Architecture**: All data is stored locally on your machine
- **Encryption**: API keys and sensitive data are encrypted with AES-256-GCM
- **No Telemetry**: We do not collect any usage data or telemetry
- **Approval Gates**: Dangerous operations require explicit user approval
- **Sandboxed Environment**: Electron security policies are enforced

### Browser Security (v0.2.0+)

- **Script Validation**: Browser extension validates all JavaScript before execution
- **Pattern Blocking**: Dangerous patterns (fetch, eval, innerHTML, etc.) are blocked
- **Length Limits**: Scripts are limited to 10,000 characters to prevent abuse
- **URL Restrictions**: Cannot access chrome://, edge://, or other internal URLs

### Logging Security (v0.2.0+)

- **Production Console Disabled**: console.log/debug/info are disabled in production builds
- **Structured Logging**: Uses Pino for secure, structured logging with log levels
- **Log Rotation**: Logs are stored in user data directory with proper management

### Automated Security (v0.2.0+)

- **CI/CD Security Scanning**: npm audit runs on every pull request
- **Snyk Integration**: Automated vulnerability scanning (optional, with SNYK_TOKEN)
- **Dependency Audits**: Regular security audits of npm dependencies

### Data Mapping Security (v0.3.0+)

- **Field Mapping**: Database fields are properly mapped between snake_case and camelCase to prevent data leakage through undefined properties
- **Input Validation**: Provider and model data validated on both frontend and backend boundaries

## Best Practices for Users

1. **Keep your encryption key safe** - If you lose it, your encrypted API keys will be inaccessible
2. **Update regularly** - Install security updates as soon as they're available
3. **Review permissions** - Only grant necessary permissions to skills and integrations
4. **Use strong API keys** - When adding AI providers, use strong, unique API keys
5. **Monitor shell commands** - Review and approve shell commands carefully
6. **Review browser scripts** - Be cautious when allowing AI to execute JavaScript in browsers

## Responsible Disclosure

We follow responsible disclosure principles and will:

- Respond to security reports within 48 hours
- Work with reporters to understand and fix vulnerabilities
- Credit reporters in security advisories (with permission)
- Coordinate public disclosure timelines

## Security Audits

If you're interested in conducting a security audit of DeskClaw, please open a report through GitHub's Private Vulnerability Reporting.

## Recent Security Improvements

### v0.3.0

- Fixed database field mapping to prevent data exposure through undefined properties
- Added input validation for provider and model data
- Fixed protocol handler to properly serve public assets
- Improved dark theme handling to prevent UI information leakage

### v0.2.0

- Added browser script validation and pattern blocking
- Disabled console output in production builds
- Added automated security scanning in CI/CD
- Enhanced input validation for file operations

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
