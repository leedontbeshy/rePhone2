import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadWorkspaceEnvironment } from '../src/config/load-environment.js';
import { seedDatabase } from './seed-data.js';
import { seedDevelopmentStorage } from './seed-storage.js';
import { databaseTargetIssue } from '../src/config/database-target.js';
import { databaseUrlSecurityIssue } from '../src/config/database-url-security.js';
import { seedDevelopmentInventory } from './seed-inventory.js';

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
  const issue = databaseTargetIssue(connectionString, process.env.NODE_ENV ?? 'development');
  if (issue) throw new Error(issue);
  const securityIssue = databaseUrlSecurityIssue(connectionString, {
    allowUnencryptedLoopback: process.env.NODE_ENV !== 'production',
    allowUnencryptedHostnames:
      process.env.NODE_ENV === 'production' ? [] : ['postgres-dev', 'postgres-test'],
    requireCertificateVerification: process.env.NODE_ENV === 'production',
  });
  if (securityIssue) throw new Error(`DATABASE_URL ${securityIssue}`);
  await seedDevelopmentStorage();
  await seedDatabase(prisma);
  if (process.env.NODE_ENV === 'development') {
    await seedDevelopmentInventory(prisma);
    await prisma.dealerEnvironment.upsert({
      where: { key: 'INSTANCE' },
      create: { key: 'INSTANCE', mode: 'TEST' },
      update: {},
    });
    await prisma.dealerPricingPolicy.upsert({
      where: { key: 'GLOBAL' },
      create: { key: 'GLOBAL' },
      update: {},
    });
    await prisma.affiliatePolicy.upsert({
      where: { key: 'GLOBAL' },
      create: { key: 'GLOBAL' },
      update: {},
    });
  }
  process.stdout.write('Seed completed idempotently.\n');
} finally {
  await prisma.$disconnect();
}
