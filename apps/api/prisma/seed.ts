import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadWorkspaceEnvironment } from '../src/config/load-environment.js';
import { seedDatabase } from './seed-data.js';

loadWorkspaceEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('DATABASE_URL is required for seeding');
}
if (
  process.env.NODE_ENV === 'production' &&
  process.env.SEED_ADMIN_EMAIL?.endsWith('@rephone.local')
) {
  throw new Error('Demo seed values are forbidden in production');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  await seedDatabase(prisma);
  process.stdout.write('Seed completed idempotently.\n');
} finally {
  await prisma.$disconnect();
}
