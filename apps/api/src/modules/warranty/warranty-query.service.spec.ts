import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { WarrantyQueryService } from './warranty-query.service.js';
import type { WarrantyOperationsRecord } from './warranty-operations.repository.js';
import type { WarrantyPolicyRecord } from './warranty-operations.repository.js';

describe('WarrantyQueryService', () => {
  it('uses the end-exclusive interval for customer warranty projections', async () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const record = warranty({ endAt: now });
    const fixture = createFixture(now);
    fixture.repository.listCustomer.mockResolvedValue({ items: [record], totalItems: 1 });

    const result = await fixture.service.listCustomer(record.customerId ?? '', {
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0]).toMatchObject({ isValid: false, isExpired: true });
  });

  it('maps failed Order ownership to a non-enumerating resource not found error', async () => {
    const fixture = createFixture(new Date('2026-08-25T12:00:00.000Z'));
    fixture.repository.findByCode.mockResolvedValue(warranty());
    fixture.ownership.assertAccess.mockImplementation(() => {
      throw new ApiError('ORDER_NOT_FOUND');
    });

    await expect(
      fixture.service.getCustomer({} as never, 'RPH-W-20260825-23456789'),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' } satisfies Partial<ApiError>);
  });

  it('returns only the public-safe snapshot after ownership succeeds', async () => {
    const fixture = createFixture(new Date('2026-08-25T12:00:00.000Z'));
    fixture.repository.findByCode.mockResolvedValue(warranty());

    const result = await fixture.service.getCustomer({} as never, 'RPH-W-20260825-23456789');

    expect(result).toMatchObject({
      warrantyCode: 'RPH-W-20260825-23456789',
      inventoryCode: 'IP-TEST-001',
      maskedIdentifierSuffix: '1234',
    });
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('voidedById');
  });

  it('returns warranty actions from the authenticated staff role', async () => {
    const fixture = createFixture(new Date('2026-08-25T12:00:00.000Z'));
    fixture.repository.findById.mockResolvedValue(warranty());

    await expect(
      fixture.service.getBackoffice('0199b354-d818-7f7c-b966-3932599978cf', 'ADMIN'),
    ).resolves.toMatchObject({ availableActions: ['VOID'] });
    await expect(
      fixture.service.getBackoffice('0199b354-d818-7f7c-b966-3932599978cf', 'EMPLOYEE'),
    ).resolves.toMatchObject({ availableActions: [] });
  });

  it('blocks policy archive when the active catalog still references it', async () => {
    const fixture = createFixture(new Date('2026-08-25T12:00:00.000Z'));
    fixture.policies.findById.mockResolvedValue(policy({ status: 'ACTIVE' }));
    fixture.catalog.hasActiveReferences.mockResolvedValue(true);

    const result = await fixture.service.getPolicy('0199b354-d818-7f7c-b966-3932599978cf', 'ADMIN');

    expect(result).toMatchObject({
      archiveBlockedReason: 'ACTIVE_CATALOG_REFERENCES',
      availableActions: ['EDIT', 'DEACTIVATE'],
    });
  });

  it('does not expose policy commands to employees', async () => {
    const fixture = createFixture(new Date('2026-08-25T12:00:00.000Z'));
    fixture.policies.findById.mockResolvedValue(policy());
    fixture.catalog.hasActiveReferences.mockResolvedValue(false);

    const result = await fixture.service.getPolicy(
      '0199b354-d818-7f7c-b966-3932599978cf',
      'EMPLOYEE',
    );

    expect(result).toMatchObject({ archiveBlockedReason: null, availableActions: [] });
  });
});

function createFixture(now: Date) {
  const repository = {
    listCustomer: vi.fn(),
    findByCode: vi.fn(),
    listPolicies: vi.fn(),
    listBackoffice: vi.fn(),
    findById: vi.fn(),
  };
  const policies = { findById: vi.fn() };
  const catalog = { hasActiveReferences: vi.fn() };
  const ownership = { assertAccess: vi.fn() };
  const clock = { now: vi.fn(() => now) };
  return {
    repository,
    policies,
    catalog,
    ownership,
    service: new WarrantyQueryService(
      repository as never,
      policies as never,
      catalog as never,
      ownership as never,
      clock,
    ),
  };
}

function policy(overrides: Partial<WarrantyPolicyRecord> = {}): WarrantyPolicyRecord {
  return {
    id: '0199b354-d818-7f7c-b966-3932599978cf',
    code: 'IPHONE-90',
    name: 'iPhone 90 ngày',
    defaultDays: 90,
    terms: 'Terms',
    status: 'INACTIVE',
    archivedAt: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    ...overrides,
  };
}

function warranty(overrides: Partial<WarrantyOperationsRecord> = {}): WarrantyOperationsRecord {
  return {
    id: '0199b354-d818-7f7c-b966-3932599978cf',
    warrantyCode: 'RPH-W-20260825-23456789',
    orderItemId: '0199b354-d818-7f7c-b966-3932599978d0',
    customerId: '0199b354-d818-7f7c-b966-3932599978d1',
    inventoryUnitId: '0199b354-d818-7f7c-b966-3932599978d2',
    policyId: null,
    daysSnapshot: 90,
    termsSnapshot: 'Terms',
    startAt: new Date('2026-08-01T00:00:00.000Z'),
    endAt: new Date('2026-10-30T00:00:00.000Z'),
    status: 'ACTIVE',
    voidReason: null,
    voidedById: null,
    voidedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    policy: null,
    voidedBy: null,
    inventoryUnit: {
      inventoryCode: 'IP-TEST-001',
      imei1Suffix: '1234',
      serialSuffix: 'ABCD',
    },
    orderItem: {
      id: '0199b354-d818-7f7c-b966-3932599978d0',
      productNameSnapshot: 'iPhone 15',
      variantNameSnapshot: '128GB Đen',
      skuSnapshot: 'IP15-128-BLK',
      inventoryCodeSnapshot: 'IP-TEST-001',
      order: {
        id: '0199b354-d818-7f7c-b966-3932599978d3',
        orderNumber: 'RPH-20260801-23456789',
        customerId: '0199b354-d818-7f7c-b966-3932599978d1',
        guestAccessTokenHash: null,
        customerName: 'Demo Customer',
        customerEmail: 'customer@rephone.local',
        customerPhone: '0900000000',
        sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
      },
    },
    ...overrides,
  };
}
