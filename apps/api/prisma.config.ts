import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
const environmentFile = candidates.find((candidate) => existsSync(candidate));
if (environmentFile !== undefined) {
  loadDotenv({ path: environmentFile, quiet: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
