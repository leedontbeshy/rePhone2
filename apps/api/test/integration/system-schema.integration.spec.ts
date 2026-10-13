import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed-data.js';
import { findSystemViolations } from '../support/system-invariants.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetTestDatabase } from '../support/test-prisma.js';
import { setTestEnvironment } from '../support/test-environment.js';

describe('system administration database invariants', () => {
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

  it('installs settings/hash constraints, append-only audit trigger, and bounded query indexes', async () => {
    const constraints = await prisma.$queryRaw<Array<{ constraintName: string }>>`
      SELECT conname AS "constraintName"
      FROM pg_constraint
      WHERE conname IN (
        'auth_sessions_refresh_token_hash_shape_check',
        'auth_tokens_token_hash_shape_check',
        'store_settings_singleton_check'
      )
      ORDER BY conname
    `;
    const triggers = await prisma.$queryRaw<Array<{ triggerName: string }>>`
      SELECT tgname AS "triggerName"
      FROM pg_trigger
      WHERE tgrelid = 'audit_logs'::regclass
        AND NOT tgisinternal
      ORDER BY tgname
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexName: string; indexDefinition: string }>>`
      SELECT indexname AS "indexName", indexdef AS "indexDefinition"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'audit_logs_action_pattern_created_at_id_idx',
          'audit_logs_actor_type_created_at_id_idx',
          'audit_logs_request_id_created_at_id_idx',
          'auth_sessions_expires_at_id_idx',
          'auth_sessions_revoked_at_id_idx',
          'auth_tokens_consumed_at_id_idx',
          'auth_tokens_expires_at_id_idx',
          'users_customer_last_login_at_id_idx'
        )
      ORDER BY indexname
    `;

    expect(constraints.map(({ constraintName }) => constraintName)).toEqual([
      'auth_sessions_refresh_token_hash_shape_check',
      'auth_tokens_token_hash_shape_check',
      'store_settings_singleton_check',
    ]);
    expect(triggers).toEqual([{ triggerName: 'audit_logs_append_only' }]);
    expect(indexes).toHaveLength(8);
    expect(
      indexes.find(({ indexName }) => indexName === 'auth_sessions_revoked_at_id_idx')
        ?.indexDefinition,
    ).toContain('WHERE (revoked_at IS NOT NULL)');
    expect(
      indexes.find(({ indexName }) => indexName === 'auth_tokens_consumed_at_id_idx')
        ?.indexDefinition,
    ).toContain('WHERE (consumed_at IS NOT NULL)');
    expect(
      indexes.find(({ indexName }) => indexName === 'users_customer_last_login_at_id_idx')
        ?.indexDefinition,
    ).toContain('WHERE (role = \'CUSTOMER\'::"UserRole")');
  });

  it('enforces bounded settings and lowercase SHA-256 credential digests', async () => {
    await expect(
      prisma.storeSettings.update({
        where: { key: 'STORE' },
        data: { pickupHoldMinutes: 10_081 },
      }),
    ).rejects.toThrow();

    const customer = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'customer@rephone.local' },
      select: { id: true },
    });
    await expect(
      prisma.authSession.create({
        data: {
          userId: customer.id,
          refreshTokenHash: 'A'.repeat(64),
          tokenFamilyId: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.authToken.create({
        data: {
          userId: customer.id,
          purpose: 'RESET_PASSWORD',
          tokenHash: 'z'.repeat(64),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ).rejects.toThrow();

    await prisma.authSession.create({
      data: {
        userId: customer.id,
        refreshTokenHash: 'a'.repeat(64),
        tokenFamilyId: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.authToken.create({
      data: {
        userId: customer.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    expect(await findSystemViolations(prisma)).toEqual([
      { checkName: 'store_settings_singleton_check', count: 0 },
      { checkName: 'auth_sessions_refresh_token_hash_shape_check', count: 0 },
      { checkName: 'auth_tokens_token_hash_shape_check', count: 0 },
    ]);
  });

  it('allows append but rejects update and delete for AuditLog', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'admin@rephone.local' },
      select: { id: true },
    });
    const audit = await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorUserId: admin.id,
        action: 'slice12.append_only_test',
        resourceType: 'System',
        resourceId: admin.id,
        requestId: `test:${randomUUID()}`,
      },
    });

    await expect(
      prisma.auditLog.update({
        where: { id: audit.id },
        data: { action: 'slice12.mutated' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: audit.id } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditLog.findUnique({ where: { id: audit.id } })).resolves.toMatchObject({
      action: 'slice12.append_only_test',
    });
  });

  it('reseed preserves settings, credentials, user/location/catalog/voucher lifecycle, and address data', async () => {
    const [employee, customer, admin, location, product, variant, voucher, address, media] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'employee@rephone.local' } }),
        prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'customer@rephone.local' } }),
        prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'admin@rephone.local' } }),
        prisma.inventoryLocation.findUniqueOrThrow({ where: { code: 'HCM-STORE-01' } }),
        prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-13' } }),
        prisma.productVariant.findUniqueOrThrow({ where: { sku: 'IP13-128-MID' } }),
        prisma.voucher.findUniqueOrThrow({ where: { normalizedCode: 'WELCOME100' } }),
        prisma.customerAddress.findUniqueOrThrow({
          where: { id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701' },
        }),
        prisma.productMedia.findFirstOrThrow({
          where: { objectPath: 'demo/catalog/products/iphone-13.png' },
        }),
      ]);
    const transitionAt = new Date('2026-08-25T08:00:00.000Z');

    await prisma.$transaction([
      prisma.storeSettings.update({
        where: { key: 'STORE' },
        data: {
          storeName: 'Cửa hàng đã cấu hình',
          version: 42,
          bankQrBucket: 'store-test',
          bankQrObjectPath: 'bank-qr/preserved.webp',
          updatedById: admin.id,
        },
      }),
      prisma.user.update({
        where: { id: employee.id },
        data: {
          passwordHash: 'preserved-employee-password-hash',
          status: 'DISABLED',
          disabledAt: transitionAt,
        },
      }),
      prisma.user.update({
        where: { id: customer.id },
        data: {
          passwordHash: 'preserved-customer-password-hash',
          status: 'SUSPENDED',
          suspendedAt: transitionAt,
        },
      }),
      prisma.inventoryLocation.update({
        where: { id: location.id },
        data: { name: 'Cửa hàng tạm đóng', status: 'INACTIVE' },
      }),
      prisma.product.update({
        where: { id: product.id },
        data: { name: 'Tên catalog đã chỉnh', status: 'ARCHIVED', archivedAt: transitionAt },
      }),
      prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          displayName: 'Variant đã lưu lịch sử',
          status: 'ARCHIVED',
          archivedAt: transitionAt,
        },
      }),
      prisma.voucher.update({
        where: { id: voucher.id },
        data: { name: 'Voucher đã đóng', status: 'ARCHIVED' },
      }),
      prisma.customerAddress.update({
        where: { id: address.id },
        data: { label: 'Địa chỉ đã chỉnh', addressLine: '456 Đường mới' },
      }),
      prisma.productMedia.update({
        where: { id: media.id },
        data: { altText: 'Ảnh đã chỉnh', sortOrder: 9 },
      }),
    ]);

    const before = await masterDataFingerprint(prisma);
    await seedDatabase(prisma);
    await seedDatabase(prisma);
    expect(await masterDataFingerprint(prisma)).toEqual(before);
  });
});

async function masterDataFingerprint(prisma: PrismaClient) {
  return Promise.all([
    prisma.storeSettings.findUniqueOrThrow({ where: { key: 'STORE' } }),
    prisma.user.findMany({
      where: {
        normalizedEmail: {
          in: ['admin@rephone.local', 'employee@rephone.local', 'customer@rephone.local'],
        },
      },
      orderBy: { normalizedEmail: 'asc' },
    }),
    prisma.inventoryLocation.findMany({ orderBy: { code: 'asc' } }),
    prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-13' } }),
    prisma.productVariant.findUniqueOrThrow({ where: { sku: 'IP13-128-MID' } }),
    prisma.voucher.findUniqueOrThrow({ where: { normalizedCode: 'WELCOME100' } }),
    prisma.customerAddress.findUniqueOrThrow({
      where: { id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f6701' },
    }),
    prisma.productMedia.findFirstOrThrow({
      where: { objectPath: 'demo/catalog/products/iphone-13.png' },
    }),
  ]);
}
