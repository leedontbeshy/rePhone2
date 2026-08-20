import type { PrismaClient } from '../src/generated/prisma/client.js';

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
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
}
