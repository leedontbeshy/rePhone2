import 'reflect-metadata';
import type { AppConfig } from './config/app-config.js';
import { loadWorkspaceEnvironment } from './config/load-environment.js';

loadWorkspaceEnvironment();

const { createApplication } = await import('./application.js');
const { APP_CONFIG } = await import('./config/app-config.module.js');

try {
  const app = await createApplication();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.api.port, process.env.API_HOST ?? '0.0.0.0');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`rephone-api failed to start: ${message}\n`);
  process.exitCode = 1;
}
