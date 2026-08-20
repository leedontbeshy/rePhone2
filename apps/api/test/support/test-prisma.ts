import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export function createTestPrisma(): PrismaClient {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@localhost:5433/rephone_test';
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing integration test against non-test database ${databaseName}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
