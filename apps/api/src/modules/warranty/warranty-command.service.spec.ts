import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { WarrantyCommandService } from './warranty-command.service.js';
import type {
  WarrantyOperationsRecord,
  WarrantyPolicyRecord,
} from './warranty-operations.repository.js';

const actor: AuditActorContext = {
  actorUserId: '0199b354-d818-7f7c-b966-3932599978cf',
  requestId: 'req-warranty',
  ipAddress: '127.0.0.1',
};

describe('WarrantyCommandService', () => {
  it('creates an inactive policy and audits it in the same transaction', async () => {
    const fixture = createFixture();
    fixture.repository.createPolicy.mockResolvedValue(policy());

    const result = await fixture.service.createPolicy(
      { code: 'IPHONE-90', name: 'iPhone 90 ngày', defaultDays: 90, terms: 'Terms' },
      actor,
    );

    expect(fixture.repository.createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IPHONE-90', status: 'INACTIVE' }),
      fixture.transaction,
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      actor,
      expect.objectContaining({ action: 'warranty_policy.created' }),
    );
    expect(result).toMatchObject({ code: 'IPHONE-90', status: 'INACTIVE' });
  });

  it('refuses to archive a policy referenced by active catalog records', async () => {
    const fixture = createFixture();
    fixture.gateway.lockPolicy.mockResolvedValue(policy({ status: 'ACTIVE' }));
    fixture.catalog.hasActiveReferences.mockResolvedValue(true);

    await expect(
      fixture.service.archivePolicy(
        '0199b354-d818-7f7c-b966-3932599978cf',
        'Không dùng nữa',
        actor,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);
    expect(fixture.repository.updatePolicy).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });

  it('replays an exact warranty void without duplicating transition or audit', async () => {
    const fixture = createFixture();
    fixture.gateway.lockById.mockResolvedValue(
      warranty({
        status: 'VOIDED',
        voidReason: 'Hoàn tiền hậu mãi',
        voidedById: actor.actorUserId,
        voidedAt: new Date('2026-08-25T10:00:00.000Z'),
      }),
    );
    fixture.repository.findById.mockResolvedValue(
      warranty({
        status: 'VOIDED',
        voidReason: 'Hoàn tiền hậu mãi',
        voidedById: actor.actorUserId,
        voidedAt: new Date('2026-08-25T10:00:00.000Z'),
      }),
    );

    const result = await fixture.service.voidWarranty(
      '0199b354-d818-7f7c-b966-3932599978cf',
      'Hoàn tiền hậu mãi',
      actor,
    );

    expect(result.status).toBe('VOIDED');
    expect(fixture.gateway.voidActive).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const transaction = { marker: 'transaction' };
  const repository = {
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    findById: vi.fn(),
  };
  const gateway = {
    lockPolicy: vi.fn(),
    lockById: vi.fn(),
    voidActive: vi.fn(),
  };
  const catalog = { hasActiveReferences: vi.fn() };
  const audit = { write: vi.fn() };
  const transactions = {
    run: vi.fn(async (_operation: string, work: (tx: unknown) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  const clock = { now: vi.fn(() => new Date('2026-08-25T12:00:00.000Z')) };
  return {
    transaction,
    repository,
    gateway,
    catalog,
    audit,
    service: new WarrantyCommandService(
      transactions as never,
      repository as never,
      gateway as never,
      catalog as never,
      audit,
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
