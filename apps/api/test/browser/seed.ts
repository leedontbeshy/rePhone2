import { PrismaPg } from '@prisma/adapter-pg';
import { seedDatabase } from '../../prisma/seed-data.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { setTestEnvironment } from '../support/test-environment.js';

setTestEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || !new URL(connectionString).pathname.endsWith('_test')) {
  throw new Error('Refusing to seed browser tests outside a _test database');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedDatabase(prisma);
} finally {
  await prisma.$disconnect();
}
