import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { findWarrantyViolations } from '../support/warranty-invariants.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

const PRIVATE_BUCKET = 'private-test';
const REQUEST_NUMBER_PREFIX = 'RPH-AS-20260825-';

describe('warranty and after-sales database invariants', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    setTestEnvironment();
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('installs lifecycle constraints, history-safe warranty relation, and queue indexes', async () => {
    const constraints = await prisma.$queryRaw<Array<{ constraintName: string }>>`
      SELECT conname AS "constraintName"
      FROM pg_constraint
      WHERE conname IN (
        'after_sales_requests_attachment_check',
        'after_sales_requests_resolution_reference_check',
        'after_sales_requests_status_check',
        'after_sales_requests_values_check',
        'after_sales_requests_warranty_id_order_item_id_fkey',
        'after_sales_requests_warranty_type_check',
        'warranties_void_check',
        'warranties_id_order_item_id_key',
        'warranty_policies_lifecycle_check',
        'warranty_policies_values_check'
      )
      ORDER BY conname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'after_sales_requests_assigned_to_id_status_updated_at_id_idx',
          'after_sales_requests_customer_id_requested_at_id_idx',
          'after_sales_requests_status_requested_at_id_idx',
          'after_sales_requests_inventory_inspection_id_key',
          'after_sales_requests_refund_id_key',
          'warranties_customer_id_created_at_id_idx',
          'warranties_status_end_at_id_idx'
        )
      ORDER BY indexname
    `;
    const legacyUnique = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'warranties_inventory_unit_id_key'
    `;
    const columns = await prisma.$queryRaw<
      Array<{ columnName: string; columnDefault: string | null; isNullable: 'NO' | 'YES' }>
    >`
      SELECT
        column_name AS "columnName",
        column_default AS "columnDefault",
        is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'after_sales_requests'
            AND column_name IN ('receive_note', 'requested_resolution'))
          OR (table_name = 'warranty_policies' AND column_name = 'status')
        )
      ORDER BY table_name, column_name
    `;

    expect(constraints.map(({ constraintName }) => constraintName)).toEqual([
      'after_sales_requests_attachment_check',
      'after_sales_requests_resolution_reference_check',
      'after_sales_requests_status_check',
      'after_sales_requests_values_check',
      'after_sales_requests_warranty_id_order_item_id_fkey',
      'after_sales_requests_warranty_type_check',
      'warranties_id_order_item_id_key',
      'warranties_void_check',
      'warranty_policies_lifecycle_check',
      'warranty_policies_values_check',
    ]);
    expect(indexes).toHaveLength(7);
    expect(legacyUnique).toEqual([{ count: 0 }]);
    expect(columns).toEqual([
      { columnName: 'receive_note', columnDefault: null, isNullable: 'YES' },
      { columnName: 'requested_resolution', columnDefault: null, isNullable: 'YES' },
      {
        columnName: 'status',
        columnDefault: '\'INACTIVE\'::"PolicyStatus"',
        isNullable: 'NO',
      },
    ]);
  });

  it('preserves multiple historical warranties for a physical unit while keeping OrderItem unique', async () => {
    const first = await createIphoneOrderItem(prisma);
    const second = await createIphoneOrderItem(prisma, first.unitId);
    const startAt = new Date('2026-08-25T02:00:00.000Z');

    await prisma.warranty.create({
      data: warrantyData(first, startAt),
    });
    await prisma.warranty.create({
      data: warrantyData(second, new Date('2027-08-25T02:00:00.000Z')),
    });
    await expect(
      prisma.warranty.create({
        data: { ...warrantyData(first, startAt), warrantyCode: warrantyCode() },
      }),
    ).rejects.toThrow();

    expect(await prisma.warranty.count({ where: { inventoryUnitId: first.unitId } })).toBe(2);
  });

  it('allows an optional requested resolution and enforces one open case plus attachment limits', async () => {
    const fixture = await createIphoneOrderItem(prisma);
    const startAt = new Date('2026-08-25T02:00:00.000Z');
    const warranty = await prisma.warranty.create({ data: warrantyData(fixture, startAt) });
    const requestId = randomUUID();

    await insertRequestedCase(prisma, requestId, fixture, warranty.id);
    await expect(insertRequestedCase(prisma, randomUUID(), fixture, warranty.id)).rejects.toThrow();

    const sixAttachments = Array.from({ length: 6 }, (_value, index) => ({
      id: randomUUID(),
      bucket: PRIVATE_BUCKET,
      objectPath: `after-sales/${requestId}/${index.toString()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1024,
      uploadedByType: 'USER',
      uploadedById: fixture.customerId,
      uploadedAt: '2026-08-25T03:00:00.000Z',
    }));
    await expect(
      prisma.$executeRaw`
        UPDATE after_sales_requests
        SET attachments = ${JSON.stringify(sixAttachments)}::jsonb
        WHERE id = ${requestId}::uuid
      `,
    ).rejects.toThrow();

    const stored = await prisma.$queryRaw<Array<{ requestedResolution: string | null }>>`
      SELECT requested_resolution AS "requestedResolution"
      FROM after_sales_requests
      WHERE id = ${requestId}::uuid
    `;
    expect(stored).toEqual([{ requestedResolution: null }]);
  });

  it('rejects malformed policy, warranty void, and after-sales lifecycle shapes', async () => {
    await expect(
      prisma.warrantyPolicy.create({
        data: {
          code: 'lowercase',
          name: 'Policy không hợp lệ',
          defaultDays: 3651,
          terms: 'Điều khoản',
        },
      }),
    ).rejects.toThrow();

    const fixture = await createIphoneOrderItem(prisma);
    const warranty = await prisma.warranty.create({
      data: warrantyData(fixture, new Date('2026-08-25T02:00:00.000Z')),
    });
    await expect(
      prisma.warranty.update({
        where: { id: warranty.id },
        data: { status: 'VOIDED', voidReason: 'bad' },
      }),
    ).rejects.toThrow();

    const requestId = randomUUID();
    await insertRequestedCase(prisma, requestId, fixture, warranty.id);
    await expect(
      prisma.$executeRaw`
        UPDATE after_sales_requests
        SET warranty_id = NULL
        WHERE id = ${requestId}::uuid
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE after_sales_requests
        SET type = 'RETURN'
        WHERE id = ${requestId}::uuid
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE after_sales_requests
        SET receive_note = 'Biên nhận không hợp lệ ở trạng thái yêu cầu'
        WHERE id = ${requestId}::uuid
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE after_sales_requests
        SET status = 'RECEIVED', received_at = NOW()
        WHERE id = ${requestId}::uuid
      `,
    ).rejects.toThrow();
  });

  it('reports zero exact preflight violations for valid warranty and requested case history', async () => {
    const first = await createIphoneOrderItem(prisma);
    const second = await createIphoneOrderItem(prisma, first.unitId);
    const firstWarranty = await prisma.warranty.create({
      data: warrantyData(first, new Date('2026-08-25T02:00:00.000Z')),
    });
    await prisma.warranty.create({
      data: warrantyData(second, new Date('2027-08-25T02:00:00.000Z')),
    });
    await insertRequestedCase(prisma, randomUUID(), first, firstWarranty.id);

    expect(await findWarrantyViolations(prisma, PRIVATE_BUCKET)).toEqual(
      PREFLIGHT_CHECKS.map((checkName) => ({ checkName, count: 0 })),
    );
  });

  it('does not reactivate or overwrite an existing seeded warranty policy', async () => {
    const policy = await prisma.warrantyPolicy.update({
      where: { code: 'IPHONE-90D' },
      data: {
        name: 'Chính sách đã điều chỉnh',
        defaultDays: 365,
        terms: 'Điều khoản đã được quản trị viên điều chỉnh.',
        status: 'INACTIVE',
        archivedAt: new Date('2026-08-25T05:00:00.000Z'),
      },
    });

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const afterSeed = await prisma.warrantyPolicy.findUniqueOrThrow({
      where: { id: policy.id },
    });
    expect(afterSeed).toEqual(policy);
  });

  it('does not mutate an inspecting after-sales case or its private attachment metadata', async () => {
    const fixture = await createAccessoryOrderItem(prisma);
    const employee = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'employee@rephone.local' },
      select: { id: true },
    });
    const requestedAt = new Date('2026-08-25T01:00:00.000Z');
    const receivedAt = new Date('2026-08-25T02:00:00.000Z');
    const inspectedAt = new Date('2026-08-25T03:00:00.000Z');
    const requestId = randomUUID();
    const attachmentId = randomUUID();
    const request = await prisma.afterSalesRequest.create({
      data: {
        id: requestId,
        requestNumber: `${REQUEST_NUMBER_PREFIX}${requestSuffix()}`,
        orderItemId: fixture.orderItemId,
        customerId: fixture.customerId,
        type: 'RETURN',
        issueDescription: 'Phụ kiện gặp lỗi kết nối và đang chờ nhân viên kiểm định.',
        requestedResolution: null,
        status: 'INSPECTING',
        receivedLocationId: fixture.locationId,
        receivedById: employee.id,
        receiveNote: 'Đã nhận đủ phụ kiện và hộp sản phẩm từ khách.',
        attachments: [
          {
            id: attachmentId,
            bucket: PRIVATE_BUCKET,
            objectPath: `after-sales/${requestId}/${attachmentId}.png`,
            mimeType: 'image/png',
            fileSize: 4096,
            uploadedByType: 'USER',
            uploadedById: fixture.customerId,
            uploadedAt: new Date('2026-08-25T01:30:00.000Z').toISOString(),
          },
        ],
        inspectionSummary: 'Đã xác nhận lỗi kết nối ngắt quãng khi truyền dữ liệu.',
        requestedAt,
        receivedAt,
        inspectedAt,
        createdAt: requestedAt,
        updatedAt: inspectedAt,
      },
    });
    const beforeSeed = await operationalAfterSalesFingerprint(prisma, request.id);

    await seedDatabase(prisma);
    await seedDatabase(prisma);

    expect(await operationalAfterSalesFingerprint(prisma, request.id)).toEqual(beforeSeed);
    const violations = await findWarrantyViolations(prisma, PRIVATE_BUCKET);
    expect(violations.filter(({ count }) => count !== 0)).toEqual([]);
  });
});

const PREFLIGHT_CHECKS = [
  'warranty_policies_values_check',
  'warranty_policies_lifecycle_check',
  'warranties_interval_check',
  'warranties_code_shape_check',
  'warranties_void_check',
  'warranties_order_item_alignment',
  'after_sales_requests_values_check',
  'after_sales_requests_attachment_check',
  'after_sales_requests_warranty_type_check',
  'after_sales_requests_resolution_reference_check',
  'after_sales_requests_status_check',
  'after_sales_requests_one_open_per_order_item',
  'after_sales_requests_one_per_inventory_inspection',
  'after_sales_requests_one_per_refund',
  'after_sales_requests_order_warranty_alignment',
  'after_sales_requests_actor_alignment',
  'after_sales_requests_inspection_alignment',
  'after_sales_requests_replacement_alignment',
  'after_sales_requests_refund_alignment',
  'after_sales_requests_inventory_outcome_alignment',
] as const;

interface IphoneOrderItemFixture {
  orderItemId: string;
  unitId: string;
  customerId: string;
}

interface AccessoryOrderItemFixture {
  orderItemId: string;
  customerId: string;
  locationId: string;
}

async function createAccessoryOrderItem(prisma: PrismaClient): Promise<AccessoryOrderItemFixture> {
  const [variant, customer, location] = await Promise.all([
    prisma.productVariant.findFirstOrThrow({
      where: {
        inventoryMode: 'QUANTITY',
        product: { type: 'ACCESSORY' },
      },
      include: { product: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    }),
    prisma.inventoryLocation.findFirstOrThrow({
      where: { type: 'STORE', status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  const cart = await prisma.cart.create({
    data: { customerId: customer.id, status: 'CONVERTED' },
  });
  const placedAt = new Date('2026-08-24T22:00:00.000Z');
  const completedAt = new Date('2026-08-25T00:00:00.000Z');
  const price = variant.salePrice?.toString() ?? '100000';
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260825-${randomAlphabet(8)}`,
      sourceCartId: cart.id,
      customerId: customer.id,
      customerName: 'Khách kiểm thử seed Slice 11',
      customerEmail: 'slice11-seed@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'PICKUP',
      fulfillmentLocationId: location.id,
      pickupLocationId: location.id,
      pickupHoldUntil: new Date('2026-08-26T00:00:00.000Z'),
      pickupReadyAt: new Date('2026-08-24T23:00:00.000Z'),
      pickedUpAt: completedAt,
      status: 'COMPLETED',
      fulfillmentStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      subtotal: price,
      grandTotal: price,
      paidAmount: price,
      balanceDue: '0',
      placedAt,
      confirmedAt: new Date('2026-08-24T22:30:00.000Z'),
      completedAt,
    },
  });
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: variant.productId,
      variantId: variant.id,
      productTypeSnapshot: 'ACCESSORY',
      productNameSnapshot: variant.product.name,
      variantNameSnapshot: variant.displayName,
      skuSnapshot: variant.sku,
      quantity: 1,
      unitPrice: price,
      lineSubtotal: price,
      lineTotal: price,
      warrantyDaysSnapshot: 30,
      warrantyTermsSnapshot: 'Bảo hành phụ kiện kiểm thử trong 30 ngày.',
    },
  });
  return { orderItemId: item.id, customerId: customer.id, locationId: location.id };
}

async function operationalAfterSalesFingerprint(prisma: PrismaClient, id: string) {
  return prisma.afterSalesRequest.findUniqueOrThrow({
    where: { id },
    select: {
      requestNumber: true,
      type: true,
      status: true,
      customerId: true,
      orderItemId: true,
      requestedResolution: true,
      receivedLocationId: true,
      receivedById: true,
      receiveNote: true,
      attachments: true,
      inspectionSummary: true,
      inventoryInspectionId: true,
      requestedAt: true,
      receivedAt: true,
      inspectedAt: true,
      updatedAt: true,
    },
  });
}

async function createIphoneOrderItem(
  prisma: PrismaClient,
  existingUnitId?: string,
): Promise<IphoneOrderItemFixture> {
  const unit = await prisma.inventoryUnit.findUniqueOrThrow({
    where: {
      id:
        existingUnitId ??
        (
          await prisma.inventoryUnit.findFirstOrThrow({
            where: { variant: { product: { type: 'IPHONE' } } },
            select: { id: true },
          })
        ).id,
    },
    include: { variant: { include: { product: true } } },
  });
  const customer = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: 'customer@rephone.local' },
    select: { id: true },
  });
  const location = await prisma.inventoryLocation.findFirstOrThrow({
    where: { type: 'STORE', status: 'ACTIVE' },
    select: { id: true },
  });
  const cart = await prisma.cart.create({
    data: { customerId: customer.id, status: 'CONVERTED' },
  });
  const now = new Date('2026-08-25T01:00:00.000Z');
  const order = await prisma.order.create({
    data: {
      orderNumber: `RPH-20260825-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      sourceCartId: cart.id,
      customerId: customer.id,
      customerName: 'Khách kiểm thử Slice 11',
      customerEmail: 'slice11-db@example.com',
      customerPhone: '0900000000',
      fulfillmentType: 'PICKUP',
      fulfillmentLocationId: location.id,
      pickupLocationId: location.id,
      pickupHoldUntil: new Date(now.getTime() + 86_400_000),
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
      subtotal: '10000000',
      grandTotal: '10000000',
      balanceDue: '10000000',
      placedAt: now,
    },
  });
  const item = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: unit.variant.productId,
      variantId: unit.variantId,
      inventoryUnitId: unit.id,
      productTypeSnapshot: 'IPHONE',
      productNameSnapshot: unit.variant.product.name,
      variantNameSnapshot: unit.variant.displayName,
      skuSnapshot: unit.variant.sku,
      inventoryCodeSnapshot: unit.inventoryCode,
      quantity: 1,
      unitPrice: '10000000',
      lineSubtotal: '10000000',
      lineTotal: '10000000',
      warrantyDaysSnapshot: 90,
      warrantyTermsSnapshot: 'Bảo hành kiểm thử trong 90 ngày.',
    },
  });
  return { orderItemId: item.id, unitId: unit.id, customerId: customer.id };
}

function warrantyData(fixture: IphoneOrderItemFixture, startAt: Date) {
  return {
    warrantyCode: warrantyCode(),
    orderItemId: fixture.orderItemId,
    customerId: fixture.customerId,
    inventoryUnitId: fixture.unitId,
    daysSnapshot: 90,
    termsSnapshot: 'Bảo hành kiểm thử trong 90 ngày.',
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 86_400_000),
  };
}

async function insertRequestedCase(
  prisma: PrismaClient,
  requestId: string,
  fixture: IphoneOrderItemFixture,
  warrantyId: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO after_sales_requests (
      id,
      request_number,
      warranty_id,
      order_item_id,
      customer_id,
      type,
      issue_description,
      requested_resolution,
      status,
      updated_at
    ) VALUES (
      ${requestId}::uuid,
      ${`${REQUEST_NUMBER_PREFIX}${requestSuffix()}`},
      ${warrantyId}::uuid,
      ${fixture.orderItemId}::uuid,
      ${fixture.customerId}::uuid,
      'WARRANTY',
      'Thiết bị gặp lỗi phần cứng cần được kiểm tra bảo hành.',
      NULL,
      'REQUESTED',
      NOW()
    )
  `;
}

function warrantyCode(): string {
  return `RPH-W-20260825-${randomAlphabet(8)}`;
}

function requestSuffix(): string {
  return randomAlphabet(6);
}

function randomAlphabet(length: number): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return randomUUID()
    .replaceAll('-', '')
    .slice(0, length)
    .split('')
    .map((character) => alphabet[Number.parseInt(character, 16)] ?? '2')
    .join('');
}
