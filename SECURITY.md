# Security Policy

## Supported versions

Security fixes are provided for the latest published `v1` release.

## Report a vulnerability

Please do not open a public issue for a suspected security vulnerability. Use GitHub's **Report a vulnerability** feature on this repository to send a private report. Include the affected version, impact, and a minimal reproduction when possible. We aim to acknowledge reports within seven days.

## Security design

- Issue titles and bodies are treated as untrusted text. Rules are literal phrases; IssueHarbor does not execute regular expressions, scripts, or issue-provided instructions.
- The action only calls GitHub's endpoint for adding labels to an issue. It does not comment, assign, close, delete, or modify pull requests.
- The supplied token is never printed. Grant only `issues: write` and the read permission needed to check out the workflow repository.
- Configuration paths must resolve inside `GITHUB_WORKSPACE`.
- Network retries are limited to transient failures and stop after three attempts.
