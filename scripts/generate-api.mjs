import { run, testEnvironment } from './environment.mjs';
const env = testEnvironment();
run('pnpm', ['--filter', '@rephone/api', 'openapi'], { env });
run('pnpm', ['--filter', '@rephone/api-client', 'generate'], { env });
