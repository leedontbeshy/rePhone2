import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import type { AffiliateLedgerService } from '../affiliate-core/affiliate-ledger.service.js';
import type { AffiliateProfileService } from './affiliate-profile.service.js';
import {
  AFFILIATE_COOKIE,
  AFFILIATE_WINDOW_MS,
  affiliateHash,
} from '../affiliate-core/affiliate.policy.js';
import { AffiliateQueryService } from './affiliate-query.service.js';

function fixture() {
  const profile = {
    id: 'affiliate',
    status: 'ACTIVE',
    code: 'share-code',
    owner: { status: 'ACTIVE' },
  };
  const policy = { enabled: true, rateBps: 200, reserveAmount: '100000', minimumProfit: '100000' };
  const unit = {
    id: 'unit',
    inventoryCode: 'IP13-001',
    salePrice: '10000000',
    acquisitionCost: '9000000',
    additionalCost: '0',
    variant: { displayName: '128 GB', product: { name: 'iPhone 13', slug: 'iphone-13' } },
    affiliateOverride: null,
  };
  const prisma = {
    affiliatePolicy: { findUnique: vi.fn().mockResolvedValue(policy) },
    affiliateProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      findMany: vi.fn().mockResolvedValue([]),
    },
    affiliateReferral: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(7),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    affiliateCommission: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    affiliatePayout: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    inventoryUnit: { findMany: vi.fn().mockResolvedValue([unit]) },
    affiliateAttribution: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const runtime = {
    enabled: true,
    assertEnabled: vi.fn(),
    config: { api: { publicUrl: 'https://api.example.test' }, scheduler: { enabled: true } },
  };
  const ledger = {
    lockOrders: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue(undefined),
  };
  const profiles = { requireOwn: vi.fn().mockResolvedValue(profile) };
  const transactions = {
    run: vi.fn(async (_name: string, work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      work(prisma as unknown as Prisma.TransactionClient),
    ),
  };
  const response = { cookie: vi.fn() };
  const service = new AffiliateQueryService(
    prisma as unknown as PrismaService,
    transactions as unknown as SerializableTransactionRunner,
    runtime as unknown as AffiliateRuntime,
    ledger as unknown as AffiliateLedgerService,
    profiles as unknown as AffiliateProfileService,
  );
  return {
    service,
    prisma,
    runtime,
    profiles,
    ledger,
    transactions,
    profile,
    policy,
    unit,
    response,
    httpResponse: response as unknown as Response,
  };
}

describe('Affiliate queries, attribution and reconciliation', () => {
  it.each([
    'runtime-disabled',
    'policy-missing',
    'policy-disabled',
    'profile-missing',
    'profile-suspended',
    'owner-disabled',
  ] as const)('does not issue a referral cookie for %s', async (condition) => {
    const f = fixture();
    if (condition === 'runtime-disabled') f.runtime.enabled = false;
    if (condition === 'policy-missing') f.prisma.affiliatePolicy.findUnique.mockResolvedValue(null);
    if (condition === 'policy-disabled') f.policy.enabled = false;
    if (condition === 'profile-missing')
      f.prisma.affiliateProfile.findUnique.mockResolvedValue(null);
    if (condition === 'profile-suspended') f.profile.status = 'SUSPENDED';
    if (condition === 'owner-disabled') f.profile.owner.status = 'DISABLED';
    await expect(f.service.refer('code', f.httpResponse)).resolves.toEqual({ captured: false });
    expect(f.response.cookie).not.toHaveBeenCalled();
    expect(f.prisma.affiliateReferral.create).not.toHaveBeenCalled();
  });

  it.each(['https:', 'http:'])(
    'stores only a token hash and issues a scoped cookie over %s',
    async (protocol) => {
      const f = fixture();
      f.runtime.config.api.publicUrl = `${protocol}//api.example.test`;
      await expect(f.service.refer('code', f.httpResponse)).resolves.toEqual({ captured: true });
      expect(f.response.cookie).toHaveBeenCalledWith(
        AFFILIATE_COOKIE,
        expect.stringMatching(/^[\w-]{43}$/),
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: protocol === 'https:',
          path: '/api/v1',
          maxAge: AFFILIATE_WINDOW_MS,
        },
      );
      const token: unknown = f.response.cookie.mock.calls[0]?.[1];
      if (typeof token !== 'string') throw new Error('Missing cookie');
      expect(f.prisma.affiliateReferral.create).toHaveBeenCalledWith({
        data: {
          affiliateId: 'affiliate',
          tokenHash: affiliateHash(token),
          expiresAt: expect.any(Date) as unknown,
        },
      });
      expect(JSON.stringify(f.prisma.affiliateReferral.create.mock.calls)).not.toContain(token);
    },
  );

  it.each([true, false])(
    'scopes dashboard and redacts internal losses for portal=%s',
    async (portal) => {
      const f = fixture();
      const commission = {
        id: 'commission',
        amount: '200000',
        paidAmount: '0',
        absorbedLoss: '150000',
        status: 'AVAILABLE',
        holdReason: null,
        createdAt: new Date(),
        availableAt: null,
        orderItem: { productNameSnapshot: 'iPhone' },
        attribution: { affiliateId: 'affiliate', order: { orderNumber: 'RP-1' } },
      };
      f.prisma.affiliateCommission.findMany.mockResolvedValue(
        Array.from({ length: 26 }, () => commission),
      );
      f.prisma.affiliateCommission.groupBy.mockResolvedValue([
        {
          status: 'AVAILABLE',
          _sum: { amount: '200000', paidAmount: '0', absorbedLoss: '150000' },
          _count: 1,
        },
        {
          status: 'PENDING',
          _sum: { amount: null, paidAmount: null, absorbedLoss: null },
          _count: 0,
        },
      ]);
      f.prisma.affiliatePayout.findMany.mockResolvedValue([
        {
          id: 'payout',
          amount: '200000',
          bankSnapshot: {
            bankName: 'BANK',
            accountHolder: 'HOLDER',
            lastFour: '1234',
            accountNumberCiphertext: 'private',
          },
        },
      ]);
      f.prisma.affiliatePayout.aggregate.mockResolvedValue({
        _sum: { amount: portal ? '200000' : null },
      });
      const result = await f.service.dashboard(portal ? 'owner' : undefined, { page: 2 });
      expect(result).toMatchObject({
        clicks: 7,
        page: 2,
        hasMore: true,
        reservedAmount: portal ? '200000' : '0',
      });
      expect(result.commissions).toHaveLength(25);
      expect(f.prisma.affiliateCommission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: portal ? { attribution: { affiliateId: 'affiliate' } } : {},
          skip: 25,
          take: 26,
        }),
      );
      expect('absorbedLoss' in (result.commissions[0] ?? {})).toBe(!portal);
      expect('absorbedLoss' in (result.totals[0] ?? {})).toBe(!portal);
      expect(result.totals[1]).toMatchObject({ amount: '0', paidAmount: '0' });
      expect(JSON.stringify(result.payouts)).not.toContain('private');
    },
  );

  it('detects pagination from payouts even when there are no commission rows', async () => {
    const f = fixture();
    await expect(f.service.dashboard()).resolves.toMatchObject({
      page: 1,
      hasMore: false,
      reservedAmount: '0',
    });
    f.prisma.affiliatePayout.findMany.mockResolvedValue(
      Array.from({ length: 26 }, () => ({ amount: '1', bankSnapshot: {} })),
    );
    const result = await f.service.dashboard();
    expect(result.payouts).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });

  it.each([undefined, 'Lee'])(
    'paginates member search %s and removes bank secrets',
    async (search) => {
      const f = fixture();
      f.prisma.affiliateProfile.findMany.mockResolvedValue(
        Array.from({ length: 26 }, () => ({
          ...f.profile,
          banks: [
            {
              id: 'bank',
              bankName: 'BANK',
              accountLastFour: '1234',
              accountNumberCiphertext: 'private',
              confirmationTokenHash: 'private-token',
            },
          ],
        })),
      );
      const result = await f.service.members({ page: 2, ...(search ? { search } : {}) });
      expect(result).toMatchObject({ page: 2, hasMore: true });
      expect(result.items).toHaveLength(25);
      expect(JSON.stringify(result)).not.toContain('private');
      expect(f.prisma.affiliateProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 26,
          where: search
            ? {
                OR: [
                  { displayName: { contains: search, mode: 'insensitive' } },
                  { code: { contains: search } },
                ],
              }
            : {},
        }),
      );
    },
  );

  it.each(['missing-policy', 'disabled-policy', 'suspended-profile'] as const)(
    'hides portal offers for %s',
    async (condition) => {
      const f = fixture();
      if (condition === 'missing-policy')
        f.prisma.affiliatePolicy.findUnique.mockResolvedValue(null);
      if (condition === 'disabled-policy') f.policy.enabled = false;
      if (condition === 'suspended-profile') f.profile.status = 'SUSPENDED';
      await expect(f.service.offers({ page: 1 }, 'owner')).resolves.toEqual({
        items: [],
        page: 1,
        hasMore: false,
      });
      expect(f.prisma.inventoryUnit.findMany).not.toHaveBeenCalled();
    },
  );

  it('returns exact-unit share links with margin caps and no internal costs', async () => {
    const f = fixture();
    f.prisma.inventoryUnit.findMany.mockResolvedValue([
      { ...f.unit, acquisitionCost: '9750000', affiliateOverride: { enabled: true, rateBps: 300 } },
    ]);
    const result = await f.service.offers({ page: 1, search: 'iPhone' }, 'owner');
    expect(result.items[0]).toMatchObject({
      estimatedCommission: '50000',
      rateBps: 300,
      destination: '/products/iphone-13/units/IP13-001',
      sharePath: '/r/share-code?to=%2Fproducts%2Fiphone-13%2Funits%2FIP13-001',
    });
    expect(result.items[0]).not.toHaveProperty('acquisitionCost');
    expect(result.items[0]).not.toHaveProperty('overrideRateBps');
    expect(f.prisma.inventoryUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycleStatus: 'AVAILABLE',
          reservations: { none: { status: 'ACTIVE' } },
        }) as unknown,
      }),
    );
  });

  it.each([
    'policy-missing',
    'reserve-missing',
    'profit-missing',
    'cost-missing',
    'disabled-unit',
    'default-rate',
    'null-price',
  ] as const)('fails closed or uses configured defaults for admin offer %s', async (condition) => {
    const f = fixture();
    if (condition === 'policy-missing') f.prisma.affiliatePolicy.findUnique.mockResolvedValue(null);
    if (condition === 'reserve-missing')
      f.prisma.affiliatePolicy.findUnique.mockResolvedValue({ ...f.policy, reserveAmount: null });
    if (condition === 'profit-missing')
      f.prisma.affiliatePolicy.findUnique.mockResolvedValue({ ...f.policy, minimumProfit: null });
    if (condition === 'cost-missing')
      f.prisma.inventoryUnit.findMany.mockResolvedValue([{ ...f.unit, acquisitionCost: null }]);
    if (condition === 'disabled-unit')
      f.prisma.inventoryUnit.findMany.mockResolvedValue([
        { ...f.unit, affiliateOverride: { enabled: false, rateBps: null } },
      ]);
    if (condition === 'null-price')
      f.prisma.inventoryUnit.findMany.mockResolvedValue([{ ...f.unit, salePrice: null }]);
    const result = await f.service.offers({ page: 1 });
    expect(result.items[0]).toMatchObject({
      sharePath: null,
      estimatedCommission: condition === 'default-rate' ? '200000' : '0',
    });
  });

  it('paginates reconciliation and resets its cursor after reaching the end', async () => {
    const f = fixture();
    f.prisma.affiliateAttribution.findMany.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({
        orderId: `order-${i.toString().padStart(3, '0')}`,
      })),
    );
    await expect(f.service.reconcileBatch()).resolves.toEqual({ processed: 100, hasMore: true });
    await expect(f.service.reconcileBatch()).resolves.toEqual({ processed: 0, hasMore: false });
    expect(f.prisma.affiliateAttribution.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { orderId: { gt: 'order-099' } } }),
    );
    await f.service.reconcileBatch();
    expect(f.prisma.affiliateAttribution.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(f.ledger.reconcile).toHaveBeenCalledTimes(100);
    expect(f.ledger.lockOrders).toHaveBeenCalledWith(f.prisma, ['order-000']);
    expect(f.prisma.affiliateReferral.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) as unknown } },
    });
  });

  it('skips disabled or overlapping ticks and recovers after an error', async () => {
    const f = fixture();
    f.runtime.enabled = false;
    await f.service.tick();
    f.runtime.enabled = true;
    f.runtime.config.scheduler.enabled = false;
    await f.service.tick();
    expect(f.prisma.affiliateAttribution.findMany).not.toHaveBeenCalled();
    f.runtime.config.scheduler.enabled = true;
    f.prisma.affiliateAttribution.findMany.mockRejectedValueOnce(
      new Error('temporary database failure'),
    );
    await expect(f.service.tick()).rejects.toThrow('temporary database failure');
    let release = () => {};
    const gate = new Promise<never[]>((resolve) => {
      release = () => {
        resolve([]);
      };
    });
    f.prisma.affiliateAttribution.findMany.mockReturnValueOnce(gate);
    const pending = f.service.tick();
    await f.service.tick();
    expect(f.prisma.affiliateAttribution.findMany).toHaveBeenCalledTimes(2);
    release();
    await pending;
    await f.service.tick();
    expect(f.prisma.affiliateAttribution.findMany).toHaveBeenCalledTimes(3);
  });
});
