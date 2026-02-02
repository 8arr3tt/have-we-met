# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

Once v1.0.0 is released, we will support the latest major version and the previous major version for security updates.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email security reports to:

**matthewbarrett95@gmail.com**

### What to Include

Please include the following information in your report:

1. **Description**: A clear description of the vulnerability
2. **Impact**: What could an attacker do with this vulnerability?
3. **Affected Versions**: Which versions are affected?
4. **Reproduction Steps**: Detailed steps to reproduce the issue
5. **Proof of Concept**: Code or configuration demonstrating the vulnerability (if applicable)
6. **Suggested Fix**: If you have ideas for how to fix it (optional)
7. **Your Contact Info**: How we can reach you for follow-up questions

### What to Expect

After you submit a report:

- **Acknowledgment**: We'll acknowledge receipt within **48 hours**
- **Initial Assessment**: We'll provide an initial assessment within **5 business days**
- **Updates**: We'll keep you informed of our progress
- **Fix Timeline**: We aim to release fixes for high/critical vulnerabilities within **30 days**
- **Credit**: We'll credit you in the release notes (unless you prefer to remain anonymous)

### Disclosure Policy

We follow a **coordinated disclosure** process:

1. You report the vulnerability privately
2. We investigate and develop a fix
3. We release a patched version
4. We publish a security advisory
5. After the patch is released, you may publicly disclose the vulnerability

We request that you:

- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what's needed to demonstrate it
- Do not access or modify other users' data

## Security Best Practices

When using **have-we-met** in production, please follow our [Security Considerations Guide](./docs/security.md).

Key recommendations:

- Validate and sanitize all user inputs
- Use parameterized queries (all our adapters do this by default)
- Configure timeouts for external services
- Store API keys in environment variables, not code
- Encrypt sensitive data at rest and in transit
- Implement rate limiting for public-facing endpoints
- Configure blocking strategies to prevent DoS
- Keep dependencies updated with `npm audit`

## Security Audits

We perform regular security reviews:

- **Dependency Audits**: We run `npm audit` before each release
- **Code Reviews**: All code changes are reviewed before merging
- **Static Analysis**: We use ESLint with security-focused rules
- **Type Safety**: TypeScript helps prevent many classes of bugs

## Known Limitations

### Development Dependencies

Our devDependencies (testing, building) may have known vulnerabilities that don't affect the published package. We evaluate these case-by-case:

- **Low/Moderate severity** in dev-only tools: Generally acceptable if the vulnerability doesn't affect library users
- **High/Critical severity** in dev dependencies: We update or replace the dependency

Users of the library do not receive devDependencies, so these vulnerabilities don't affect production deployments.

### Out of Scope

The following are generally **not** considered security vulnerabilities:

- **Performance issues**: Slow matching due to poor configuration (use blocking strategies)
- **Match accuracy**: Incorrect matches due to misconfiguration or data quality
- **Resource exhaustion**: Memory/CPU usage on extremely large datasets (batch your data appropriately)
- **Dependency vulnerabilities**: In packages we don't control (but we'll update if possible)
- **Social engineering**: Attacks that don't involve technical vulnerabilities in the code

## Security Features

**have-we-met** includes several security features:

- **Parameterized Queries**: All database adapters use safe query patterns
- **Input Validation**: Builders validate configuration at build time
- **Null Safety**: Comprehensive null/undefined handling
- **No Code Execution**: User data is never executed as code
- **Circuit Breakers**: Prevent cascading failures from external services
- **Timeouts**: Prevent hanging operations
- **Type Safety**: TypeScript prevents many common bugs

## Security Updates

Security updates are published as patch releases:

- **Critical**: Released immediately, version bump 0.1.0 → 0.1.1
- **High**: Released within 1 week
- **Moderate**: Included in next scheduled release
- **Low**: Included in next minor/major release

Security updates are announced via:

- GitHub Security Advisories
- npm security advisories
- Release notes
- CHANGELOG.md

## Attribution

We appreciate the security research community. If you report a valid security vulnerability, we'll:

- Credit you in the security advisory (if you wish)
- Mention you in release notes
- Send you a thank you email
- Consider you a contributor to the project

Thank you for helping keep **have-we-met** secure!

## Questions?

If you have questions about this policy, please open a GitHub Discussion or contact us at matthewbarrett95@gmail.com.
