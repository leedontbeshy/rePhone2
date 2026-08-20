import type { PrismaClient } from '../src/generated/prisma/client.js';
import { argon2id, hash } from 'argon2';
import { seedPublicCatalog } from './seed-catalog.js';

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  await seedIdentity(prisma);

  await prisma.storeSettings.upsert({
    where: { key: 'STORE' },
    update: {
      storeName: 'rePhone',
      storePhone: process.env.SEED_STORE_PHONE ?? '0900000000',
      storeAddress: process.env.SEED_STORE_ADDRESS ?? '123 Đường Demo, TP. Hồ Chí Minh',
      defaultShippingFee: '30000',
      shippingDepositAmount: '500000',
      pickupHoldMinutes: 1_440,
      depositProofWindowMinutes: 30,
      depositReviewWindowMinutes: 1_440,
      defaultWarrantyDays: 90,
      defaultWarrantyTerms:
        'Bảo hành lỗi phần cứng theo kết quả kiểm định; không gồm rơi vỡ, vào nước hoặc hao mòn pin.',
      bankName: process.env.SEED_BANK_NAME ?? 'DEMO BANK',
      bankAccountNumber: process.env.SEED_BANK_ACCOUNT_NUMBER ?? '0000000000',
      bankAccountHolder: process.env.SEED_BANK_ACCOUNT_HOLDER ?? 'REPHONE DEMO',
    },
    create: {
      key: 'STORE',
      storeName: 'rePhone',
      storePhone: process.env.SEED_STORE_PHONE ?? '0900000000',
      storeAddress: process.env.SEED_STORE_ADDRESS ?? '123 Đường Demo, TP. Hồ Chí Minh',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      defaultShippingFee: '30000',
      shippingDepositAmount: '500000',
      pickupHoldMinutes: 1_440,
      depositProofWindowMinutes: 30,
      depositReviewWindowMinutes: 1_440,
      defaultWarrantyDays: 90,
      defaultWarrantyTerms:
        'Bảo hành lỗi phần cứng theo kết quả kiểm định; không gồm rơi vỡ, vào nước hoặc hao mòn pin.',
      bankName: process.env.SEED_BANK_NAME ?? 'DEMO BANK',
      bankAccountNumber: process.env.SEED_BANK_ACCOUNT_NUMBER ?? '0000000000',
      bankAccountHolder: process.env.SEED_BANK_ACCOUNT_HOLDER ?? 'REPHONE DEMO',
    },
  });

  await Promise.all([
    prisma.inventoryLocation.upsert({
      where: { code: 'HCM-STORE-01' },
      update: { name: 'Cửa hàng Hồ Chí Minh', type: 'STORE', status: 'ACTIVE' },
      create: {
        code: 'HCM-STORE-01',
        name: 'Cửa hàng Hồ Chí Minh',
        type: 'STORE',
        status: 'ACTIVE',
      },
    }),
    prisma.inventoryLocation.upsert({
      where: { code: 'HCM-WH-01' },
      update: { name: 'Kho Hồ Chí Minh', type: 'WAREHOUSE', status: 'ACTIVE' },
      create: {
        code: 'HCM-WH-01',
        name: 'Kho Hồ Chí Minh',
        type: 'WAREHOUSE',
        status: 'ACTIVE',
      },
    }),
    prisma.warrantyPolicy.upsert({
      where: { code: 'IPHONE-90D' },
      update: { name: 'Bảo hành iPhone 90 ngày', defaultDays: 90, status: 'ACTIVE' },
      create: {
        code: 'IPHONE-90D',
        name: 'Bảo hành iPhone 90 ngày',
        defaultDays: 90,
        terms:
          'Bảo hành lỗi phần cứng theo kết quả kiểm định; không gồm rơi vỡ, vào nước hoặc hao mòn pin.',
        status: 'ACTIVE',
      },
    }),
    prisma.warrantyPolicy.upsert({
      where: { code: 'ACCESSORY-30D' },
      update: { name: 'Bảo hành phụ kiện 30 ngày', defaultDays: 30, status: 'ACTIVE' },
      create: {
        code: 'ACCESSORY-30D',
        name: 'Bảo hành phụ kiện 30 ngày',
        defaultDays: 30,
        terms: 'Bảo hành lỗi kỹ thuật của nhà sản xuất trong 30 ngày.',
        status: 'ACTIVE',
      },
    }),
  ]);

  if (process.env.NODE_ENV !== 'production') {
    await seedPublicCatalog(prisma);
  }
}

async function seedIdentity(prisma: PrismaClient): Promise<void> {
  const adminEmail = requiredSeedValue('SEED_ADMIN_EMAIL');
  const adminPassword = requiredSeedValue('SEED_ADMIN_PASSWORD');
  const demoPhone = requiredSeedValue('SEED_DEMO_PHONE');
  const includeDemoAccounts = process.env.NODE_ENV !== 'production';
  const argonOptions = {
    type: argon2id,
    memoryCost: integerEnvironment('ARGON2_MEMORY_KIB', 65_536),
    timeCost: integerEnvironment('ARGON2_TIME_COST', 3),
    parallelism: integerEnvironment('ARGON2_PARALLELISM', 1),
  } as const;

  const adminPasswordHash = await hash(adminPassword, argonOptions);
  await prisma.user.upsert({
    where: { normalizedEmail: normalizeEmail(adminEmail) },
    update: {
      email: adminEmail.trim(),
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      fullName: 'Quản trị viên Demo',
      phone: demoPhone,
      employeeCode: 'ADM-001',
      disabledAt: null,
      suspendedAt: null,
    },
    create: {
      email: adminEmail.trim(),
      normalizedEmail: normalizeEmail(adminEmail),
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      fullName: 'Quản trị viên Demo',
      phone: demoPhone,
      employeeCode: 'ADM-001',
    },
  });

  if (!includeDemoAccounts) {
    return;
  }

  const employeeEmail = requiredSeedValue('SEED_EMPLOYEE_EMAIL');
  const customerEmail = requiredSeedValue('SEED_CUSTOMER_EMAIL');
  const employeePasswordHash = await hash(
    requiredSeedValue('SEED_EMPLOYEE_PASSWORD'),
    argonOptions,
  );
  const customerPasswordHash = await hash(
    requiredSeedValue('SEED_CUSTOMER_PASSWORD'),
    argonOptions,
  );

  await prisma.user.upsert({
    where: { normalizedEmail: normalizeEmail(employeeEmail) },
    update: {
      email: employeeEmail.trim(),
      passwordHash: employeePasswordHash,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      fullName: 'Nhân viên Demo',
      phone: demoPhone,
      employeeCode: 'EMP-001',
      hiredAt: new Date('2026-01-15T00:00:00.000Z'),
      emailVerifiedAt: new Date('2026-01-15T00:00:00.000Z'),
      disabledAt: null,
      suspendedAt: null,
    },
    create: {
      email: employeeEmail.trim(),
      normalizedEmail: normalizeEmail(employeeEmail),
      passwordHash: employeePasswordHash,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      fullName: 'Nhân viên Demo',
      phone: demoPhone,
      employeeCode: 'EMP-001',
      hiredAt: new Date('2026-01-15T00:00:00.000Z'),
      emailVerifiedAt: new Date('2026-01-15T00:00:00.000Z'),
    },
  });

  const customer = await prisma.user.upsert({
    where: { normalizedEmail: normalizeEmail(customerEmail) },
    update: {
      email: customerEmail.trim(),
      passwordHash: customerPasswordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Khách hàng Demo',
      phone: demoPhone,
      employeeCode: null,
      hiredAt: null,
      disabledAt: null,
      suspendedAt: null,
    },
    create: {
      email: customerEmail.trim(),
      normalizedEmail: normalizeEmail(customerEmail),
      passwordHash: customerPasswordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Khách hàng Demo',
      phone: demoPhone,
    },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.customerAddress.updateMany({
      where: { userId: customer.id, archivedAt: null, isDefault: true },
      data: { isDefault: false },
    });
    await transaction.customerAddress.upsert({
      where: { id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701' },
      update: {
        userId: customer.id,
        label: 'Nhà',
        receiverName: customer.fullName,
        phone: demoPhone,
        addressLine: '123 Đường Demo',
        ward: 'Phường Demo',
        district: 'Quận Demo',
        province: 'TP. Hồ Chí Minh',
        isDefault: true,
        archivedAt: null,
      },
      create: {
        id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701',
        userId: customer.id,
        label: 'Nhà',
        receiverName: customer.fullName,
        phone: demoPhone,
        addressLine: '123 Đường Demo',
        ward: 'Phường Demo',
        district: 'Quận Demo',
        province: 'TP. Hồ Chí Minh',
        isDefault: true,
      },
    });
  });
}

function requiredSeedValue(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for identity seed`);
  }
  return value;
}

function integerEnvironment(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
