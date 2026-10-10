import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadWorkspaceEnvironment(): void {
  if (process.env.REPHONE_AFFILIATE_TEST === 'true' || process.env.REPHONE_LOCAL_SANDBOX === 'true')
    return;
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const environmentFile = candidates.find((candidate) => existsSync(candidate));
  if (environmentFile !== undefined) {
    config({ path: environmentFile, quiet: true });
  }
}
