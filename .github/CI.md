# CI verification and baseline review

The repository uses GitHub Actions for verification. It does not deploy applications or change production databases. Branch protection and rulesets are not configured by these workflows; at implementation time `main` has neither configured.

## Pull requests

Every PR runs formatting, lint, type checking, unit/script tests, generated OpenAPI/client verification and production builds. The affected-area classifier compares the PR head with its merge-base, reads NUL-delimited paths, and treats moves as deletion plus addition. Failure to determine the diff fails CI. Documentation-only changes skip database and browser checks; runtime/shared tooling changes run both.

`ci-required` is the stable check to select in a future branch ruleset. It accepts an omitted suite only when classification succeeded and explicitly says the suite is unnecessary. Missing flags, failed/cancelled jobs and required suites that were skipped fail the aggregate.

## Release verification

Full verification runs on pushes to `main`, manual dispatch, or PRs carrying `full-ci`. Adding an unrelated label does not start/cancel release jobs. Reopening a labeled PR reruns verification. Each job/OS has its own cancellation group.

```powershell
gh pr edit <number> --add-label full-ci
gh workflow run release-verification.yml --ref <branch>
```

`release-ready` requires production image smoke, Linux/Windows fast gates, API coverage plus migration-upgrade tests, Windows Chromium/Firefox/WebKit verification, and production performance checks. It records the exact tested checkout SHA, run ID and attempt. A PR checkout SHA may be GitHub's synthetic merge commit; it is not interchangeable with the PR head SHA. A skipped release job or a run for a different SHA is not release evidence. There is currently no deploy step consuming this check, and no merge queue is enabled.

API coverage executes the same unit/integration/E2E test sets once under instrumentation, retains all existing thresholds, and runs the migration-upgrade harness separately. PRs retain their uninstrumented integration/E2E runs. Destructive preparation still requires a dedicated local `_test` database; the safety rehearsal requires the validation-specific refusal, not a DNS/connection error.

## Shared artifacts

Browser reports are verified after successful and failed tests. Only validated JSON and matching generated HTML are staged for upload, independently for each browser suite. Unexpected files, symlinks, sensitive strings, invalid values or mismatched HTML block publication. A successful suite without a report fails verification. Raw traces, screenshots and videos stay off shared artifacts; baseline PNG candidates are the explicit exception described below.

Performance artifacts contain validated build provenance, numeric profile/budget/sample data, route templates and numeric client-media counts. Raw request paths, runtime errors, attachments and source excerpts are omitted. Job summaries contain only provenance and step outcomes, and are published separately even if report validation fails.

## Visual baseline candidates

Run **Visual baseline candidates** manually against the intended branch/commit:

```powershell
gh workflow run visual-baselines.yml --ref <branch>
```

GitHub must first know this workflow on the default branch before manual dispatch is available. The workflow generates deterministic Windows PNGs, stages only matching snapshot PNGs, and attaches a manifest with source SHA and per-file SHA-256. It never commits or creates `release-ready`. Review the images, commit approved baseline changes, then rerun normal release verification on the new SHA. Do not treat candidate generation as a successful comparison against approved baselines.

## Caching and maintenance

The shared setup action pins Node/pnpm and uses frozen installs. pnpm's store cache is separate from Turbo task caches and Next.js compile caches. Cache keys include OS, architecture, toolchain/lockfile hash, task/build namespace and checkout SHA. Each namespace has a single writer per run; PR/release writers are distinct. Restore keys never cross toolchain/lockfile or OS boundaries.

Database tests and measured performance results are not cached. Next.js restores only `<distDir>/cache`, then builds the current source; whole builds are not transferred between runners. Browser/performance jobs do not save unused Turbo caches.

Turbo also hashes root TypeScript/ESLint/runtime configuration, shared config packages, test-environment setup and CI workflow/actions. A dry-run regression verifies that changing shared configuration invalidates cached type checks.

Before editing workflows, run actionlint and the `scripts/ci-*.spec.mjs` regression tests. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and relevant application suites. Git Bash is required for the generator-failure regression on CI; Windows hosts with another Bash installation can supply `CI_BASH`.

Measure both cold and warm runs using job/step timestamps and cache-hit logs. Compare against the observed pre-change PR validation of 6m16s and full release critical path of roughly 12m. Sum job execution durations separately for runner minutes, excluding queue time. Do not infer speedups from timeouts or a single cached run.

| Decision                                       | Alternative                               | Reason                                                |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Preserve separate PR and release workflows     | Consolidate orchestration                 | Smaller change; retain existing test boundaries       |
| Fail when diff/classification is unknown       | Assume no affected suites                 | Prevent silent omissions                              |
| Publish only verified, staged files            | Upload report directories unconditionally | Verification and publication cover the same bytes     |
| Separate baseline generation                   | Update snapshots in release verification  | Candidate generation cannot certify a release         |
| Execute release API suites once under coverage | Repeat integration/E2E before coverage    | Preserve test sets while removing duplicate execution |
| Cache tasks/compile intermediates              | Transfer complete web builds              | Rebuild and measure the current source on each runner |
