# Security Policy

## Supported Versions

The following versions of the project are currently supported with security updates. Since the project is in active development, only the latest version on the `main` branch is supported.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

As this is a public-interest research project, we take security seriously. If you discover a vulnerability, please report it through one of the following channels:

1. **GitHub Issues**: If the vulnerability is not sensitive or does not expose private data (the site is entirely static and reads from public records), please open an issue.
2. **Private Disclosure**: If you discover a sensitive vulnerability (e.g., in the SSRF guard or scraper infrastructure), please reach out to the maintainer directly through the contact information provided on their GitHub profile or the organization's primary contact.

### Scope

- **Scrapers**: Vulnerabilities in scraper logic or the [SSRF guard](scraper/url_safety.py).
- **Frontend**: Potential XSS or security regressions in the static SPA logic under `docs/`.
- **Data Integrity**: Issues that could lead to data poisoning or corruption of the parsed public record.

We appreciate your efforts to keep this research archive safe and reliable.
