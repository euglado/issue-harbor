import { appendFile, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTriage } from './triage.mjs';

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME || '';
const repository = process.env.GITHUB_REPOSITORY || '';
const configPathInput = process.env.INPUT_CONFIG_PATH || '.github/issue-harbor.json';
const dryRunInput = (process.env.INPUT_DRY_RUN || 'false').toLowerCase();
const outputPath = process.env.GITHUB_OUTPUT;

function ensureInsideWorkspace(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('The configuration file must be inside GITHUB_WORKSPACE.');
  }
}

function outputValue(value) {
  return String(value).replace(/[\r\n]/g, ' ');
}

async function main() {
  if (!eventPath || !repository) throw new Error('GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required.');
  if (!['true', 'false'].includes(dryRunInput)) throw new Error('dry-run must be "true" or "false".');

  const root = await realpath(workspace);
  const requestedConfig = path.resolve(root, configPathInput);
  ensureInsideWorkspace(root, requestedConfig);
  const configPath = await realpath(requestedConfig);
  ensureInsideWorkspace(root, configPath);

  const [eventText, configText] = await Promise.all([
    readFile(eventPath, 'utf8'),
    readFile(configPath, 'utf8'),
  ]);
  const payload = JSON.parse(eventText);
  const config = JSON.parse(configText);
  const [owner, repo] = repository.split('/');
  if (!owner || !repo || repository.split('/').length !== 2) throw new Error('GITHUB_REPOSITORY must use owner/repository format.');

  const result = await runTriage({
    eventName,
    payload,
    config,
    owner,
    repo,
    token: process.env.INPUT_TOKEN,
    dryRun: dryRunInput === 'true',
  });

  if (outputPath) {
    await appendFile(outputPath, `status=${outputValue(result.status)}\nissue-number=${outputValue(result.issueNumber ?? '')}\nlabels=${outputValue((result.labels ?? []).join(','))}\n`);
  }
  console.log(`IssueHarbor: ${result.status}${result.labels?.length ? ` (${result.labels.length} label(s))` : ''}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof SyntaxError ? 'Invalid JSON in event payload or configuration.' : error.message;
    console.error(`IssueHarbor failed: ${message}`);
    process.exitCode = 1;
  });
}

export { ensureInsideWorkspace };
