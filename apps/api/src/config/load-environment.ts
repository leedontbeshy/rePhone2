import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

export function loadWorkspaceEnvironment(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const environmentFile = candidates.find((candidate) => existsSync(candidate));
  if (environmentFile !== undefined) {
    config({ path: environmentFile, quiet: true });
  }
}
