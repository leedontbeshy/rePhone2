import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const releaseJobs = [
  'production-images',
  'fast-gates',
  'database-gates',
  'browser-gate',
  'performance-gate',
];
const statuses = new Set(['success', 'failure', 'cancelled', 'skipped']);

export function evaluateGate(mode, needs) {
  const failures = [];
  const requireSuccess = (job) => {
    if (needs[job]?.result !== 'success') failures.push(`${job} must succeed`);
  };
  if (mode === 'pr') {
    requireSuccess('changes');
    requireSuccess('validation');
    for (const [job, flag] of [
      ['database', 'api'],
      ['browser-smoke', 'browser'],
    ]) {
      const required = needs.changes?.outputs?.[flag];
      if (!['true', 'false'].includes(required))
        failures.push(`${flag} scope is missing or invalid`);
      else if (required === 'true') requireSuccess(job);
      else if (!['success', 'skipped'].includes(needs[job]?.result))
        failures.push(`${job} did not complete safely`);
    }
  } else if (mode === 'release') releaseJobs.forEach(requireSuccess);
  else throw new Error('Unknown CI gate');
  return failures;
}

export function gateSummary(mode, needs, { sha, runId, attempt }) {
  if (!/^[a-f\d]{40,64}$/.test(sha) || !/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) {
    throw new Error('Invalid CI provenance');
  }
  const jobs = mode === 'pr' ? ['changes', 'validation', 'database', 'browser-smoke'] : releaseJobs;
  const failures = evaluateGate(mode, needs);
  return [
    `## ${mode === 'pr' ? 'ci-required' : 'release-ready'}`,
    '',
    `Tested checkout: \`${sha}\` · Run: ${runId} · Attempt: ${attempt}`,
    '',
    '| Job | Result |',
    '| --- | --- |',
    ...jobs.map(
      (job) => `| ${job} | ${statuses.has(needs[job]?.result) ? needs[job].result : 'missing'} |`,
    ),
    '',
    ...(failures.length
      ? failures.map((message) => `- ${message}`)
      : ['All required checks passed.']),
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  const needs = JSON.parse(process.env.CI_NEEDS ?? '{}');
  const summary = gateSummary(mode, needs, {
    sha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
  if (evaluateGate(mode, needs).length) process.exitCode = 1;
}
