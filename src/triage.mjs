const API_VERSION = '2026-03-10';
const MAX_ATTEMPTS = 3;

export class ConfigurationError extends Error {}

function assert(condition, message) {
  if (!condition) throw new ConfigurationError(message);
}

export function validateConfig(config) {
  assert(config && typeof config === 'object' && !Array.isArray(config), 'Configuration must be a JSON object.');
  assert(config.version === 1, 'Configuration version must be 1.');
  assert(Array.isArray(config.rules), 'Configuration rules must be an array.');
  assert(config.rules.length <= 100, 'Configuration may contain at most 100 rules.');

  const labels = new Set();
  for (const [index, rule] of config.rules.entries()) {
    const at = `Rule ${index + 1}`;
    assert(rule && typeof rule === 'object' && !Array.isArray(rule), `${at} must be an object.`);
    assert(typeof rule.label === 'string' && rule.label.trim().length > 0 && rule.label.trim().length <= 50, `${at} label must contain 1 to 50 characters.`);
    assert(Array.isArray(rule.keywords) && rule.keywords.length > 0 && rule.keywords.length <= 20, `${at} must have 1 to 20 keywords.`);
    const labelKey = rule.label.trim().toLocaleLowerCase('en-US');
    assert(!labels.has(labelKey), `${at} duplicates label "${rule.label.trim()}".`);
    labels.add(labelKey);
    for (const keyword of rule.keywords) {
      assert(typeof keyword === 'string' && keyword.trim().length > 0 && keyword.trim().length <= 100, `${at} keywords must contain 1 to 100 characters.`);
    }
  }
  return config;
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsKeyword(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  return normalizedKeyword.length > 0 && ` ${text} `.includes(` ${normalizedKeyword} `);
}

export function labelsForIssue(config, issue) {
  validateConfig(config);
  const text = normalizeText(`${issue?.title ?? ''} ${issue?.body ?? ''}`);
  const labels = [];
  for (const rule of config.rules) {
    if (rule.keywords.some((keyword) => containsKeyword(text, keyword))) labels.push(rule.label.trim());
  }
  return labels;
}

export function isSupportedIssueEvent(eventName, payload) {
  if (eventName !== 'issues' || !['opened', 'edited'].includes(payload?.action)) return false;
  return Boolean(payload.issue && !payload.issue.pull_request && Number.isInteger(payload.issue.number));
}

function retryDelay(response, attempt) {
  const raw = response?.headers?.get?.('retry-after');
  const seconds = raw == null ? 0 : Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000);
  return Math.min(250 * (2 ** (attempt - 1)), 1000);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function addIssueLabels({ owner, repo, issueNumber, labels, token, fetchImpl = fetch, sleep = wait }) {
  if (!labels.length) return { status: 'no_labels', labels: [] };
  if (!token) throw new Error('A GitHub token is required when labels need to be added.');
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('Issue number must be a positive integer.');
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Repository coordinates are invalid.');

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`;
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) throw new Error('GitHub API request failed after bounded retries.');
      await sleep(250 * (2 ** (attempt - 1)));
      continue;
    }

    if (response.ok) return { status: 'labeled', labels };
    if (attempt < MAX_ATTEMPTS && (response.status === 429 || response.status >= 500)) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    throw new Error(`GitHub API rejected the label request (HTTP ${response.status}). Check token permissions and label names.`);
  }
  throw new Error('GitHub API request did not complete.');
}

export async function runTriage({ eventName, payload, config, owner, repo, token, dryRun = false, fetchImpl, sleep }) {
  validateConfig(config);
  if (!isSupportedIssueEvent(eventName, payload)) return { status: 'skipped', reason: 'unsupported_event' };

  const labels = labelsForIssue(config, payload.issue);
  if (!labels.length) return { status: 'no_match', labels: [] };
  if (dryRun) return { status: 'dry_run', labels };

  const result = await addIssueLabels({
    owner,
    repo,
    issueNumber: payload.issue.number,
    labels,
    token,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(sleep ? { sleep } : {}),
  });
  return { ...result, issueNumber: payload.issue.number };
}
