# IssueHarbor

[![CI](https://github.com/euglado/issue-harbor/actions/workflows/ci.yml/badge.svg)](https://github.com/euglado/issue-harbor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**IssueHarbor** is a small GitHub Action that labels incoming issues with transparent, configurable keyword rules. It helps maintainers sort a busy issue inbox without sending issue text to an external service or granting a bot broad repository access.

Rules are ordinary JSON. A keyword such as `crash` matches the word “crash”, not “crashing”; phrases such as `does not work` can match across punctuation or line breaks. Every matching rule adds its label, so an issue can receive more than one label.

[Türkçe belge](README.tr.md) · [Workflow example](docs/workflow-example.yml) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## What it does

- Runs for newly opened issues and edits to issue titles or descriptions.
- Matches literal words and phrases in the title and body, ignoring case and punctuation.
- Adds matching labels to the issue; it leaves current labels in place.
- Supports dry-run mode so a repository can preview matches before enabling writes.
- Uses GitHub's API directly with Node.js 24 and no runtime npm dependencies.
- Restricts configuration files to the checked-out workspace and bounds retries for temporary API failures.

## What it does not do

IssueHarbor does not process pull requests, create or remove labels, post comments, assign people, close issues, run user-provided code, use regular expressions, or send issue contents to an AI or third-party service. It does not decide whether a report is valid; it only applies the rules you configure.

## Quick start

### 1. Create the labels

In your repository, create the labels you want IssueHarbor to apply (for example `bug`, `question`, `documentation`, and `enhancement`). The action is intended to use labels already set up by the repository maintainers.

### 2. Add a rules file

Create `.github/issue-harbor.json`:

```json
{
  "version": 1,
  "rules": [
    {
      "label": "bug",
      "keywords": ["bug", "crash", "does not work", "not working"]
    },
    {
      "label": "question",
      "keywords": ["how do I", "how can I", "question", "help"]
    },
    {
      "label": "documentation",
      "keywords": ["docs", "documentation", "README"]
    },
    {
      "label": "enhancement",
      "keywords": ["feature request", "would be useful", "please add"]
    }
  ]
}
```

You can start from [the sample configuration](.github/issue-harbor.example.json). Each rule must have a label and between 1 and 20 keywords. A rule matches when **any** of its keywords occurs as a whole word or phrase in the issue title or body. Each configured label can appear in only one rule.

### 3. Add a workflow

Create `.github/workflows/issue-harbor.yml`:

```yaml
name: Label community issues

on:
  issues:
    types: [opened, edited]

permissions:
  contents: read
  issues: write

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: Label issue
        uses: euglado/issue-harbor@v1
        with:
          token: ${{ github.token }}
          config-path: .github/issue-harbor.json
```

The workflow requests only the permissions needed to check out the repository and add issue labels. If your organization restricts the default token, create a GitHub App token with the minimum required repository permission and pass it through a secret instead.

### 4. Preview before enabling writes (optional)

Set `dry-run: 'true'` on the action step. The action reports its status and matched labels in the step outputs and log, but makes no GitHub API request. Once your rules behave as expected, remove the option or set it to `'false'`.

## Inputs and outputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `token` | No | empty | Token used to add labels. Provide `${{ github.token }}` or a suitably scoped GitHub App token. A token is needed only if a label match is found. |
| `config-path` | No | `.github/issue-harbor.json` | Workspace-relative JSON rule file. Paths outside `GITHUB_WORKSPACE` are rejected. |
| `dry-run` | No | `false` | When `true`, report matching labels without making a write request. |

| Output | Description |
| --- | --- |
| `status` | `labeled`, `dry_run`, `no_match`, or `skipped`. |
| `issue-number` | Number of the issue processed, if applicable. |
| `labels` | Comma-separated list of matched label names. |

## Matching behavior

- Text is normalized with Unicode NFKC, case folding, and punctuation/whitespace normalization.
- Matching is literal and boundary-aware. `bug` matches “a bug report” but not “debugging”.
- Phrases can match across punctuation. `does not work` matches “does-not-work”.
- Rules are OR-based internally (any keyword matches that rule); different matching rules all contribute labels.
- Only the title and body are considered. Comments, usernames, labels, and attachments are not read.
- Configuration is capped at 100 rules, 20 keywords per rule, and 100 characters per keyword.

## Permissions and privacy

IssueHarbor uses the GitHub REST API to add labels to the event's issue. The recommended workflow permissions are `contents: read` and `issues: write`. No token is logged. Issue titles and bodies stay in the workflow runner and are not transmitted anywhere except GitHub's own API request metadata; the action does not include issue text in that request.

For stronger supply-chain protection, pin third-party actions to a reviewed full commit SHA. The sample pins `actions/checkout`; the `euglado/issue-harbor@v1` ref is the action's maintained major-version tag. You may pin IssueHarbor itself to a release commit SHA in higher-control environments.

## Development

Requirements: Node.js 24 or later and npm.

```sh
npm ci
npm run check
npm audit --audit-level=high
```

Tests use Node's built-in test runner. They mock the GitHub API and do not need credentials, network access, or a live repository. See [Contributing](CONTRIBUTING.md) before opening a pull request.

## Troubleshooting

- **HTTP 403:** confirm the workflow has `issues: write`, the repository permits the token, and the event is allowed to write.
- **HTTP 404/422:** check the repository coordinates and make sure each configured label is valid for the target repository.
- **No labels matched:** verify the JSON path, rule spelling, and issue title/body. Set `dry-run: 'true'` while refining rules.
- **Invalid configuration:** validate the JSON syntax and keep `version` set to `1`.
- **No run for an event:** the action intentionally handles only `issues.opened` and `issues.edited` and skips pull requests.

## License

IssueHarbor is available under the [MIT License](LICENSE).
