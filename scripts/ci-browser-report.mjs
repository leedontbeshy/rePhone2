import { appendFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifySharedReportFolder } from './verify-playwright-shared-report.mjs';
import { renderReport } from './playwright-shared-artifact-reporter.mjs';

export async function stageBrowserReport(source, destination, outcome) {
  if (!['success', 'failure'].includes(outcome)) return false;
  const present = await lstat(source).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!present) {
    if (outcome === 'success') throw new Error('Successful browser suite did not produce a report');
    return false;
  }
  if (!present.isDirectory()) throw new Error('Report must be a regular directory');
  const report = await verifySharedReportFolder(source);
  if (outcome === 'success' && (report.run.status !== 'passed' || report.stats.total === 0)) {
    throw new Error('Successful browser suite produced an incomplete report');
  }
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(destination, 'index.html'), renderReport(report));
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ready = await stageBrowserReport(
      process.argv[2],
      process.argv[3],
      process.env.REPORT_OUTCOME,
    );
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
    process.stdout.write(ready ? 'Verified browser report staged.\n' : 'No report to publish.\n');
  } catch {
    // Never print report contents or assertion diffs into CI logs.
    process.stderr.write('Browser report verification failed; upload blocked.\n');
    process.exitCode = 1;
  }
}
