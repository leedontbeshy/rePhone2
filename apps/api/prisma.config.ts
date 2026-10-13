import { defineConfig } from 'prisma/config';
import { loadWorkspaceEnvironment } from './src/config/load-environment.js';
loadWorkspaceEnvironment();
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
});
