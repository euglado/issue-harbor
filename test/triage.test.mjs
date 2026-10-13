import test from 'node:test';
import assert from 'node:assert/strict';
import { addIssueLabels, labelsForIssue, normalizeText, runTriage, validateConfig } from '../src/triage.mjs';
import { ensureInsideWorkspace } from '../src/index.mjs';

const config = {
  version: 1,
  rules: [
    { label: 'bug', keywords: ['crash', 'does not work'] },
    { label: 'question', keywords: ['how do I', 'help'] },
    { label: 'documentation', keywords: ['docs'] },
  ],
};

const issueEvent = (overrides = {}) => ({
  action: 'opened',
  issue: { number: 12, title: 'Crash in the app', body: 'After sign-in', ...overrides },
});

test('validates a supported configuration', () => {
  assert.equal(validateConfig(config), config);
});

test('rejects malformed, duplicate, and oversized rules', () => {
  for (const bad of [null, [], {}, { version: 2, rules: [] }, { version: 1, rules: 'no' }]) {
    assert.throws(() => validateConfig(bad));
  }
  assert.throws(() => validateConfig({ version: 1, rules: [{ label: 'bug', keywords: [] }] }), /keywords/);
  assert.throws(() => validateConfig({ version: 1, rules: [
    { label: 'Bug', keywords: ['x'] }, { label: 'bug', keywords: ['y'] },
  ] }), /duplicates/);
  assert.throws(() => validateConfig({ version: 1, rules: Array(101).fill({ label: 'x', keywords: ['x'] }) }), /100 rules/);
});

test('normalizes Unicode, case, punctuation, and whitespace', () => {
  assert.equal(normalizeText('  ＣRASH—In  café! '), 'crash in café');
});

test('matches literal keywords on word boundaries and across punctuation', () => {
  assert.deepEqual(labelsForIssue(config, { title: 'CRASHING', body: '' }), []);
  assert.deepEqual(labelsForIssue(config, { title: 'Crash!', body: 'HOW do I fix this?' }), ['bug', 'question']);
  assert.deepEqual(labelsForIssue(config, { title: '', body: 'This does not\nwork. Please help.' }), ['bug', 'question']);
});

test('skips non-issue, unsupported actions, and pull requests', async () => {
  for (const [eventName, payload] of [
    ['pull_request', issueEvent()],
    ['issues', { ...issueEvent(), action: 'closed' }],
    ['issues', issueEvent({ pull_request: { url: 'https://example.invalid' } })],
    ['issues', { action: 'opened', issue: { title: 'missing number' } }],
  ]) {
    assert.deepEqual(await runTriage({ eventName, payload, config }), { status: 'skipped', reason: 'unsupported_event' });
  }
});

test('returns no-match without needing a token or API request', async () => {
  const result = await runTriage({ eventName: 'issues', payload: issueEvent({ title: 'Hello', body: 'General feedback' }), config });
  assert.deepEqual(result, { status: 'no_match', labels: [] });
});

test('dry-run reports labels without calling GitHub', async () => {
  const result = await runTriage({
    eventName: 'issues', payload: issueEvent(), config, dryRun: true,
    fetchImpl: () => assert.fail('dry-run must not call the API'),
  });
  assert.deepEqual(result, { status: 'dry_run', labels: ['bug'], });
});

test('appends only matching labels through the issue-label endpoint', async () => {
  let request;
  const result = await runTriage({
    eventName: 'issues', payload: issueEvent(), config, owner: 'octo', repo: 'project', token: 'example-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    },
  });
  assert.equal(result.status, 'labeled');
  assert.equal(request.url, 'https://api.github.com/repos/octo/project/issues/12/labels');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer example-token');
  assert.equal(request.options.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.deepEqual(JSON.parse(request.options.body), { labels: ['bug'] });
});

test('requires a token only when a request would be made', async () => {
  await assert.rejects(addIssueLabels({ owner: 'octo', repo: 'project', issueNumber: 1, labels: ['bug'] }), /token is required/);
  assert.deepEqual(await addIssueLabels({ owner: 'octo', repo: 'project', issueNumber: 1, labels: [] }), { status: 'no_labels', labels: [] });
  await assert.rejects(addIssueLabels({ owner: 'octo', repo: 'project', issueNumber: -1, labels: ['bug'], token: 'example-token' }), /positive integer/);
});

test('retries a transient server error with a bounded delay', async () => {
  let calls = 0;
  const waits = [];
  const result = await addIssueLabels({
    owner: 'octo', repo: 'project', issueNumber: 1, labels: ['bug'], token: 'secret',
    fetchImpl: async () => (++calls === 1 ? { ok: false, status: 503, headers: new Headers() } : { ok: true, status: 200 }),
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(result.status, 'labeled');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [250]);
});

test('stops retrying after three transient failures and does not expose token', async () => {
  let calls = 0;
  await assert.rejects(addIssueLabels({
    owner: 'octo', repo: 'project', issueNumber: 1, labels: ['bug'], token: 'example-secret',
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503, headers: new Headers() }; },
    sleep: async () => {},
  }), (error) => {
    assert.equal(calls, 3);
    assert.match(error.message, /HTTP 503/);
    assert.doesNotMatch(error.message, /example-secret/);
    return true;
  });
});

test('does not retry permission or validation failures', async () => {
  let calls = 0;
  await assert.rejects(addIssueLabels({
    owner: 'octo', repo: 'project', issueNumber: 1, labels: ['bug'], token: 'secret',
    fetchImpl: async () => { calls += 1; return { ok: false, status: 403, headers: new Headers() }; },
  }), /HTTP 403/);
  assert.equal(calls, 1);
  await assert.rejects(addIssueLabels({ owner: 'octo/name', repo: 'project', issueNumber: 1, labels: ['bug'], token: 'secret' }), /coordinates/);
});

test('rejects configuration paths outside the workspace', () => {
  assert.doesNotThrow(() => ensureInsideWorkspace('C:\\repo', 'C:\\repo\\config.json'));
  assert.throws(() => ensureInsideWorkspace('C:\\repo', 'C:\\other\\secret.json'), /inside GITHUB_WORKSPACE/);
  assert.throws(() => ensureInsideWorkspace('C:\\repo', 'C:\\repo'), /inside GITHUB_WORKSPACE/);
});
