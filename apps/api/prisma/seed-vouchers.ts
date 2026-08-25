import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';

const VOUCHERS = [
  {
    id: '019c8f40-0000-7000-8000-000000000501',
    code: 'WELCOME100',
    name: 'Chào mừng khách hàng mới',
    description: 'Giảm 100.000đ cho đơn hàng demo từ 3.000.000đ.',
    discountType: 'FIXED' as const,
    discountValue: '100000',
    maxDiscountAmount: null,
    minimumOrderAmount: '3000000',
    totalUsageLimit: 100,
    perCustomerLimit: null,
    visibility: 'PUBLIC' as const,
    scopeType: 'ORDER' as const,
    scopeConfig: Prisma.DbNull,
    status: 'ACTIVE' as const,
  },
  {
    id: '019c8f40-0000-7000-8000-000000000502',
    code: 'IPHONE5',
    name: 'Ưu đãi iPhone thành viên',
    description: 'Giảm 5% tối đa 500.000đ cho iPhone.',
    discountType: 'PERCENT' as const,
    discountValue: '5',
    maxDiscountAmount: '500000',
    minimumOrderAmount: '0',
    totalUsageLimit: null,
    perCustomerLimit: 1,
    visibility: 'ACCOUNT_ONLY' as const,
    scopeType: 'PRODUCT_TYPE' as const,
    scopeConfig: { productType: 'IPHONE' },
    status: 'ACTIVE' as const,
  },
  {
    id: '019c8f40-0000-7000-8000-000000000503',
    code: 'DEMO-DRAFT',
    name: 'Voucher nháp demo',
    description: 'Fixture để demo cập nhật và kích hoạt voucher.',
    discountType: 'PERCENT' as const,
    discountValue: '3',
    maxDiscountAmount: '200000',
    minimumOrderAmount: '1000000',
    totalUsageLimit: 50,
    perCustomerLimit: null,
    visibility: 'PUBLIC' as const,
    scopeType: 'ORDER' as const,
    scopeConfig: Prisma.DbNull,
    status: 'DRAFT' as const,
  },
  {
    id: '019c8f40-0000-7000-8000-000000000504',
    code: 'DEMO-PAUSED',
    name: 'Voucher tạm dừng demo',
    description: 'Fixture để demo chỉnh rule rồi kích hoạt lại.',
    discountType: 'FIXED' as const,
    discountValue: '50000',
    maxDiscountAmount: null,
    minimumOrderAmount: '500000',
    totalUsageLimit: 25,
    perCustomerLimit: null,
    visibility: 'PUBLIC' as const,
    scopeType: 'ORDER' as const,
    scopeConfig: Prisma.DbNull,
    status: 'PAUSED' as const,
  },
] as const;

const STARTS_AT = new Date('2026-01-01T00:00:00.000Z');
const ENDS_AT = new Date('2030-01-01T00:00:00.000Z');

export async function seedVouchers(prisma: PrismaClient): Promise<void> {
  for (const voucher of VOUCHERS) {
    const data = {
      code: voucher.code,
      name: voucher.name,
      description: voucher.description,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      maxDiscountAmount: voucher.maxDiscountAmount,
      minimumOrderAmount: voucher.minimumOrderAmount,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      totalUsageLimit: voucher.totalUsageLimit,
      perCustomerLimit: voucher.perCustomerLimit,
      visibility: voucher.visibility,
      scopeType: voucher.scopeType,
      scopeConfig: voucher.scopeConfig,
      status: voucher.status,
    };
    await prisma.voucher.upsert({
      where: { normalizedCode: voucher.code },
      update: {},
      create: { id: voucher.id, normalizedCode: voucher.code, ...data },
    });
  }
}
