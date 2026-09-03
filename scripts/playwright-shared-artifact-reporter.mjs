import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPORT_SCHEMA_VERSION = 1;

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const relativeFile = (rootDir, file) => {
  const relative = path.relative(rootDir, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return path.basename(file);
  }
  return relative.replaceAll('\\', '/');
};

const emptyStats = () => ({
  total: 0,
  expected: 0,
  unexpected: 0,
  flaky: 0,
  skipped: 0,
});

const renderReport = (report) => {
  const rows = report.tests
    .map(
      (test) => `
        <tr>
          <td>${escapeHtml(test.projectName)}</td>
          <td><strong>${escapeHtml(test.title)}</strong></td>
          <td>${escapeHtml(test.location.file)}:${test.location.line}</td>
          <td><span class="status status-${escapeHtml(test.outcome)}">${escapeHtml(test.outcome)}</span></td>
          <td>${test.duration} ms</td>
          <td>${test.results.length}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>rePhone browser release report</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #f4f7fa; color: #102033; }
      main { max-width: 1180px; margin: 0 auto; padding: 32px 24px 48px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { color: #526579; }
      .summary { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 12px; margin: 24px 0; }
      .metric, .table-wrap { border: 1px solid #d9e2ec; border-radius: 12px; background: #fff; box-shadow: 0 8px 24px rgba(16, 32, 51, .06); }
      .metric { padding: 16px; }
      .metric span { display: block; color: #60758a; font-size: 13px; }
      .metric strong { display: block; margin-top: 6px; font-size: 22px; }
      .table-wrap { overflow: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 13px 14px; border-bottom: 1px solid #e7edf3; text-align: left; white-space: nowrap; }
      th { color: #526579; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      .status { display: inline-flex; min-width: 76px; justify-content: center; border-radius: 999px; padding: 5px 10px; background: #edf2f7; }
      .status-expected { background: #dff6e9; color: #087443; }
      .status-unexpected { background: #ffe4e6; color: #b4232d; }
      .status-flaky { background: #fff2cc; color: #8a5a00; }
      .status-skipped { background: #e9eef4; color: #526579; }
      footer { margin-top: 18px; color: #60758a; font-size: 13px; }
      @media (max-width: 760px) { .summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); } main { padding: 22px 14px 36px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Browser release report</h1>
      <p>Run status: <strong>${escapeHtml(report.run.status)}</strong> · ${escapeHtml(report.run.startTime)} · ${report.run.duration} ms</p>
      <section class="summary" aria-label="Run summary">
        <div class="metric"><span>Total</span><strong>${report.stats.total}</strong></div>
        <div class="metric"><span>Expected</span><strong>${report.stats.expected}</strong></div>
        <div class="metric"><span>Unexpected</span><strong>${report.stats.unexpected}</strong></div>
        <div class="metric"><span>Flaky</span><strong>${report.stats.flaky}</strong></div>
        <div class="metric"><span>Skipped</span><strong>${report.stats.skipped}</strong></div>
      </section>
      <section class="table-wrap">
        <table>
          <thead><tr><th>Project</th><th>Test</th><th>Location</th><th>Outcome</th><th>Duration</th><th>Attempts</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <footer>Shared reports intentionally omit Git metadata, source snippets, browser step arguments, errors, logs and attachments.</footer>
    </main>
  </body>
</html>`;
};

export default class PlaywrightSharedArtifactReporter {
  constructor(options = {}) {
    if (!options.outputFolder) {
      throw new Error('The shared Playwright reporter requires an outputFolder');
    }
    this.outputFolder = path.resolve(options.outputFolder);
    this.rootDir = process.cwd();
    this.tests = new Map();
  }

  printsToStdio() {
    return false;
  }

  onConfigure(config) {
    this.rootDir = config.rootDir;
  }

  onTestEnd(testCase, result) {
    let entry = this.tests.get(testCase.id);
    if (!entry) {
      const projectName = testCase.parent.project()?.name ?? 'default';
      entry = {
        testCase,
        projectName,
        title: testCase.title,
        location: {
          file: relativeFile(this.rootDir, testCase.location.file),
          line: testCase.location.line,
          column: testCase.location.column,
        },
        expectedStatus: testCase.expectedStatus,
        results: [],
      };
      this.tests.set(testCase.id, entry);
    }
    entry.results.push({
      status: result.status,
      duration: result.duration,
      retry: result.retry,
    });
  }

  async onEnd(result) {
    const stats = emptyStats();
    const tests = [...this.tests.values()]
      .map((entry) => {
        const outcome = entry.testCase.outcome();
        stats.total += 1;
        stats[outcome] += 1;
        return {
          projectName: entry.projectName,
          title: entry.title,
          location: entry.location,
          expectedStatus: entry.expectedStatus,
          outcome,
          duration: entry.results.reduce((total, attempt) => total + attempt.duration, 0),
          results: entry.results,
        };
      })
      .sort(
        (left, right) =>
          left.projectName.localeCompare(right.projectName) ||
          left.location.file.localeCompare(right.location.file) ||
          left.location.line - right.location.line ||
          left.title.localeCompare(right.title),
      );

    const report = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      run: {
        status: result.status,
        startTime: result.startTime.toISOString(),
        duration: result.duration,
      },
      stats,
      projects: [...new Set(tests.map((test) => test.projectName))],
      tests,
    };

    await rm(this.outputFolder, { recursive: true, force: true });
    await mkdir(this.outputFolder, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(this.outputFolder, 'report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      ),
      writeFile(path.join(this.outputFolder, 'index.html'), renderReport(report)),
    ]);
  }
}

export { REPORT_SCHEMA_VERSION, renderReport };
