# Contributing

Thanks for helping make IssueHarbor clearer and safer for maintainers.

## Before opening a pull request

1. Open an issue to discuss a substantial feature or behavior change.
2. Keep matching deterministic and configuration-driven. Do not add remote services, telemetry, or extra write actions without a documented proposal.
3. Add or update tests for behavior changes.
4. Run `npm ci` and `npm run check` with Node.js 24.
5. Update the README or security documentation when user-visible behavior or permissions change.

## Pull request checklist

- Explain the problem and the chosen behavior.
- Keep the GitHub token out of logs, fixtures, and screenshots.
- Keep the workflow token permissions as narrow as possible.
- Confirm that no test depends on a live GitHub repository or account.

By submitting a contribution, you agree that it may be distributed under the repository's MIT license.
