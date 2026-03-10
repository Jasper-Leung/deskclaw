# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.0   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please follow these steps:

1. **Do not create a public GitHub issue** - this would expose the vulnerability to the public
2. **Email us directly** at security@example.com with the details of the vulnerability
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

- **Local-First Architecture**: All data is stored locally on your machine
- **Encryption**: API keys and sensitive data are encrypted with AES-256-GCM
- **No Telemetry**: We do not collect any usage data or telemetry
- **Approval Gates**: Dangerous operations require explicit user approval
- **Sandboxed Environment**: Electron security policies are enforced

## Best Practices for Users

1. **Keep your encryption key safe** - If you lose it, your encrypted API keys will be inaccessible
2. **Update regularly** - Install security updates as soon as they're available
3. **Review permissions** - Only grant necessary permissions to skills and integrations
4. **Use strong API keys** - When adding AI providers, use strong, unique API keys
5. **Monitor shell commands** - Review and approve shell commands carefully

## Responsible Disclosure

We follow responsible disclosure principles and will:

- Respond to security reports within 48 hours
- Work with reporters to understand and fix vulnerabilities
- Credit reporters in security advisories (with permission)
- Coordinate public disclosure timelines

## Security Audits

If you're interested in conducting a security audit of DeskClaw, please contact us at security@example.com.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
