import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDatabase } from '../seed-data.js';
const database = new URL(process.env['DATABASE_URL'] ?? 'postgresql://invalid/invalid');
const localTarget = database.hostname === '127.0.0.1' && database.port === '5433';
const dockerTarget =
  process.env['REPHONE_LOCAL_DOCKER'] === 'true' &&
  database.hostname === 'postgres-test' &&
  database.port === '5432';
if (
  process.env['NODE_ENV'] !== 'test' ||
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  database.search !== '' ||
  database.hash !== '' ||
  (!localTarget && !dockerTarget) ||
  database.pathname !== '/rephone_test' ||
  process.env['AFFILIATE_ENVIRONMENT'] !== 'TEST'
)
  throw new Error('Affiliate seed requires the isolated local rephone_test database');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: database.toString() }),
});
try {
  await seedDatabase(prisma);
  await prisma.affiliatePolicy.upsert({
    where: { key: 'GLOBAL' },
    create: { key: 'GLOBAL' },
    update: {},
  });
  // Demo machines need cost data before the protected commission formula can produce an offer.
  const units = await prisma.inventoryUnit.findMany({
    where: {
      acquisitionCost: null,
      inventoryCode: {
        in: ['IP13-MID-001', 'IP13-BLU-001', 'IP14P-128-001', 'IP14P-256-001', 'IP15PM-256-001'],
      },
      salePrice: { not: null },
    },
    select: { id: true, salePrice: true },
  });
  for (const unit of units)
    if (unit.salePrice)
      await prisma.inventoryUnit.update({
        where: { id: unit.id },
        data: { acquisitionCost: ((BigInt(unit.salePrice.toString()) * 80n) / 100n).toString() },
      });
  process.stdout.write(
    'Seeded local rephone_test. Existing affiliate configuration was preserved.\n',
  );
} finally {
  await prisma.$disconnect();
}
