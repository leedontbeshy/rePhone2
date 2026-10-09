import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { DealerRuntime } from '../../src/modules/dealers/dealer-runtime.service.js';
import { seedDatabase } from '../seed-data.js';

if (process.env['REPHONE_LOCAL_SANDBOX'] !== 'true') loadWorkspaceEnvironment();
const target = new URL(process.env['DATABASE_URL'] ?? 'postgresql://invalid/invalid');
if (
  process.env['DEALER_ENVIRONMENT'] !== 'TEST' ||
  process.env['DEALER_ENABLED'] !== 'true' ||
  !/_(test|sandbox)$/.test(target.pathname) ||
  process.env['NODE_ENV'] === 'production'
)
  throw new Error(
    'Dealer fixtures require an explicitly enabled, isolated TEST database and non-production runtime.',
  );
process.env['DEALER_WORKER_ENABLED'] = 'false';
const { createApplication } = await import('../../src/application.js');
const app = await createApplication({ enableSwagger: false });
try {
  await app.init();
  const prisma = app.get(PrismaService);
  const runtime = app.get(DealerRuntime);
  runtime.assertSandbox();
  await seedDatabase(prisma);
  const owner = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: (process.env['SEED_CUSTOMER_EMAIL'] ?? '').toLowerCase() },
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: (process.env['SEED_ADMIN_EMAIL'] ?? '').toLowerCase() },
  });
  const dealer = await prisma.dealerProfile.upsert({
    where: { ownerUserId: owner.id },
    update: {},
    create: {
      ownerUserId: owner.id,
      legalName: 'TEST Dealer Company',
      businessType: 'COMPANY',
      taxCode: '0000000000',
      representativeName: 'TEST Operator',
      businessAddress: 'TEST Address, TP. Hồ Chí Minh',
      contactEmail: owner.email,
      contactPhone: '0900000000',
      displayName: 'Cửa hàng đại lý TEST',
      approvedDomains: [],
      businessStatus: 'ACTIVE',
      approvedById: admin.id,
      approvedAt: new Date(),
      termsVersion: runtime.termsVersion,
      termsAcceptedAt: new Date(),
    },
  });
  if ((await prisma.dealerBankAccount.count({ where: { dealerId: dealer.id } })) === 0)
    await prisma.dealerBankAccount.create({
      data: {
        dealerId: dealer.id,
        bankName: 'TEST BANK — KHÔNG CHUYỂN TIỀN',
        accountNumberCiphertext: runtime.encrypt('0000000000'),
        accountLastFour: '0000',
        accountHolder: 'TEST DEALER',
        emailConfirmedAt: new Date(),
        verifiedAt: new Date(),
        verifiedById: admin.id,
        effectiveAt: new Date(),
      },
    });
  await prisma.dealerPricingPolicy.update({
    where: { key: 'GLOBAL' },
    data: {
      enabled: true,
      discountBps: 500,
      reserveAmount: '100000',
      minimumProfit: '100000',
      shippingFee: '30000',
      supportedProvinces: ['TP. Hồ Chí Minh', 'TP.HCM', 'Hà Nội'],
      version: { increment: 1 },
    },
  });
  await prisma.storeSettings.update({
    where: { key: 'STORE' },
    data: {
      bankName: 'TEST BANK — KHÔNG CHUYỂN TIỀN',
      bankAccountNumber: '0000000000',
      bankAccountHolder: 'REPHONE TEST',
    },
  });
  // Only seed fixture units missing costs; never edit a sold machine or existing operator cost.
  const units = await prisma.inventoryUnit.findMany({
    where: {
      lifecycleStatus: 'AVAILABLE',
      acquisitionCost: null,
      salePrice: { gt: 300000 },
      reservations: { none: { status: 'ACTIVE' } },
    },
    select: { id: true, salePrice: true },
  });
  for (const unit of units)
    await prisma.inventoryUnit.update({
      where: { id: unit.id },
      data: {
        acquisitionCost: ((BigInt(unit.salePrice?.toString() ?? '0') * 8n) / 10n).toString(),
      },
    });
  process.stdout.write(
    `TEST dealer ready: ${dealer.id}. Sign in with the configured seed customer; use the configured seed admin for simulation. No API secrets were generated.\n`,
  );
} finally {
  await app.close();
}
