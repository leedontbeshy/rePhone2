import { mkdir, writeFile, appendFile } from 'node:fs/promises';

const name = process.argv[2];
if (!/^[a-z][a-z0-9-]*$/.test(name ?? '')) throw new Error('Invalid summary name');
const steps = JSON.parse(process.env.CI_STEPS ?? '{}');
const results = Object.fromEntries(
  Object.entries(steps)
    .filter(([id]) => /^[\w-]+$/.test(id))
    .map(([id, step]) => [
      id,
      ['success', 'failure', 'cancelled', 'skipped'].includes(step.outcome)
        ? step.outcome
        : 'missing',
    ]),
);
const {
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: runId,
  GITHUB_RUN_ATTEMPT: attempt,
  RUNNER_OS: runner,
} = process.env;
if (
  !/^[a-f\d]{40,64}$/.test(sha ?? '') ||
  !/^\d+$/.test(runId ?? '') ||
  !/^\d+$/.test(attempt ?? '') ||
  !['Linux', 'Windows', 'macOS'].includes(runner)
)
  throw new Error('Invalid CI provenance');
await mkdir('.local/ci-summary', { recursive: true });
await writeFile(
  `.local/ci-summary/${name}.json`,
  `${JSON.stringify({ sha, runId, attempt, runner, results }, null, 2)}\n`,
);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${name}\n\nCheckout: \`${sha}\` · Run ${runId}, attempt ${attempt}\n\n${Object.entries(
      results,
    )
      .map(([id, outcome]) => `- ${id}: ${outcome}`)
      .join('\n')}\n`,
  );
