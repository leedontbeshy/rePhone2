import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { databaseTargetIssue } from '../../src/config/database-target.js';

export function createTestPrisma(): PrismaClient {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@localhost:5434/rephone_test';
  const issue = databaseTargetIssue(connectionString, 'test');
  if (issue) throw new Error(`Refusing integration test: ${issue}`);
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing integration test against non-test database ${databaseName}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
  const databaseName = rows[0]?.databaseName ?? '';
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to truncate non-test database ${databaseName}`);
  }
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE table_list text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO table_list
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';
      IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' CASCADE';
      END IF;
    END $$;
  `);
}
