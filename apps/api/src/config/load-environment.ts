import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadWorkspaceEnvironment(): void {
  if (process.env.NODE_ENV === 'test' || process.env.REPHONE_SKIP_ENV_FILE === 'true') return;
  const file =
    process.env.REPHONE_ENV_FILE ??
    (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
  const candidates = [resolve(process.cwd(), file), resolve(process.cwd(), '../..', file)];
  const environmentFile = candidates.find((candidate) => existsSync(candidate));
  if (environmentFile !== undefined) {
    config({ path: environmentFile, quiet: true });
  }
}
