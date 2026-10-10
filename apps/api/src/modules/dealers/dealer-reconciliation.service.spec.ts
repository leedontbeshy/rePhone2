import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DealerReconciliationService } from './dealer-reconciliation.service.js';

const locks = vi.hoisted(() => ({
  receipt: vi.fn(),
  order: vi.fn(),
  funding: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('./dealer-ledger.reader.js', () => ({
  lockDealerReceipt: locks.receipt,
  readDealerFunding: locks.funding,
  refreshDealerFunding: locks.refresh,
}));
vi.mock('./dealer-order.service.js', () => ({ lockDealerOrder: locks.order }));
const actor = { actorUserId: 'admin', requestId: 'req', ipAddress: '127.0.0.1' };
const key = 'receipt-correction-001';

function fixture() {
  const allocation = {
    id: 'allocation',
    amount: '800',
    reversals: [] as { amount: string }[],
    refundSources: [] as { refund: { status: string } }[],
  };
  const receipt = { id: 'receipt', reconciliationHold: false, allocations: [allocation] };
  const projection = { refundObligationAmount: 0n, unallocatedAvailable: 200n };
  const order = { id: 'order', status: 'CONFIRMED', grandTotal: '800' };
  const funding = {
    fundingShortfall: 0n,
    rows: [] as { bankTransaction: { reconciliationHold: boolean } }[],
  };
  const reconciliation = {
    id: 'case',
    bankTransactionId: 'receipt',
    proposedAmount: '-100',
    reason: 'Correction',
    resolvedAt: null as Date | null,
  };
  const tx = {
    order: {
      findMany: vi.fn().mockResolvedValue([{ id: 'order' }]),
      count: vi.fn().mockResolvedValue(0),
    },
    shipment: { count: vi.fn().mockResolvedValue(0) },
    dealerBankCorrection: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'correction' }),
    },
    dealerReconciliationCase: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(reconciliation),
      create: vi.fn().mockResolvedValue({ id: 'case' }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    dealerBankTransaction: { update: vi.fn().mockResolvedValue({}) },
    dealerPaymentAllocation: {
      findUnique: vi.fn().mockResolvedValue({ orderId: 'order', bankTransactionId: 'receipt' }),
    },
    dealerAllocationReversal: { create: vi.fn().mockResolvedValue({}) },
    dealerOrderDetail: { update: vi.fn().mockResolvedValue({}) },
  };
  const transactions = {
    run: vi.fn(
      async (_name: string, work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  locks.receipt.mockResolvedValue({ receipt, projection, effective: 1000n });
  locks.order.mockResolvedValue(order);
  locks.funding.mockResolvedValue(funding);
  const service = new DealerReconciliationService(
    tx as unknown as PrismaService,
    transactions as unknown as SerializableTransactionRunner,
    audit,
  );
  return {
    service,
    tx,
    transactions,
    audit,
    allocation,
    receipt,
    projection,
    order,
    funding,
    reconciliation,
  };
}

describe('Dealer reconciliation money protections', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([undefined, '', 'short', 'invalid key with space', 'a'.repeat(129)])(
    'rejects invalid correction key %s without a transaction',
    (invalid) => {
      const f = fixture();
      expect(() => f.service.correct('receipt', '-100', 'Correction', invalid, actor)).toThrow();
      expect(f.transactions.run).not.toHaveBeenCalled();
    },
  );

  it('appends a valid correction with audit instead of overwriting the receipt', async () => {
    const f = fixture();
    await expect(f.service.correct('receipt', '-100', 'Correction', key, actor)).resolves.toEqual({
      id: 'correction',
      requiresReconciliation: false,
      replayed: false,
    });
    expect(f.tx.dealerBankCorrection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: '-100',
        bankTransactionId: 'receipt',
        actorUserId: 'admin',
      }) as unknown,
    });
    expect(f.tx.dealerBankTransaction.update).not.toHaveBeenCalled();
    expect(f.audit.write).toHaveBeenCalledWith(
      f.tx,
      actor,
      expect.objectContaining({ action: 'dealer.receipt.corrected' }),
    );
  });

  it.each(['correction', 'case'] as const)(
    'replays the same %s and rejects changed payloads',
    async (kind) => {
      const f = fixture();
      const lookup = kind === 'case' ? f.tx.dealerReconciliationCase : f.tx.dealerBankCorrection;
      lookup.findUnique.mockResolvedValue({
        id: 'old',
        amount: kind === 'correction' ? '-100' : undefined,
        proposedAmount: '-100',
        reason: 'Correction',
      });
      await expect(f.service.correct('receipt', '-100', 'Correction', key, actor)).resolves.toEqual(
        { id: 'old', requiresReconciliation: kind === 'case', replayed: true },
      );
      await expect(f.service.correct('receipt', '-99', 'Correction', key, actor)).rejects.toThrow();
      await expect(f.service.correct('receipt', '-100', 'Different', key, actor)).rejects.toThrow();
      expect(f.tx.dealerBankCorrection.create).not.toHaveBeenCalled();
      expect(f.tx.dealerReconciliationCase.create).not.toHaveBeenCalled();
    },
  );

  it.each(['hold', 'refund', 'shipped', 'negative-receipt', 'overallocated'] as const)(
    'opens a case instead of changing money for %s',
    async (condition) => {
      const f = fixture();
      if (condition === 'hold') f.receipt.reconciliationHold = true;
      if (condition === 'refund') f.projection.refundObligationAmount = 1n;
      if (condition === 'shipped') f.tx.order.count.mockResolvedValue(1);
      const amount =
        condition === 'negative-receipt' ? '-1001' : condition === 'overallocated' ? '-201' : '100';
      await expect(f.service.correct('receipt', amount, 'Correction', key, actor)).resolves.toEqual(
        { id: 'case', requiresReconciliation: true, replayed: false },
      );
      expect(f.tx.dealerBankCorrection.create).not.toHaveBeenCalled();
      expect(f.tx.dealerBankTransaction.update).toHaveBeenCalledWith({
        where: { id: 'receipt' },
        data: { reconciliationHold: true },
      });
    },
  );

  it.each(['missing', 'removed', 'completed', 'shipped', 'refund'] as const)(
    'refuses unsafe allocation reversal: %s',
    async (condition) => {
      const f = fixture();
      if (condition === 'missing') f.tx.dealerPaymentAllocation.findUnique.mockResolvedValue(null);
      if (condition === 'removed') f.receipt.allocations = [];
      if (condition === 'completed') f.order.status = 'COMPLETED';
      if (condition === 'shipped') f.tx.shipment.count.mockResolvedValue(1);
      if (condition === 'refund')
        f.allocation.refundSources = [{ refund: { status: 'PROCESSING' } }];
      await expect(
        f.service.reverseAllocation('allocation', 'Wrong order', actor),
      ).rejects.toThrow();
      expect(f.tx.dealerAllocationReversal.create).not.toHaveBeenCalled();
    },
  );

  it('reverses only the remaining allocation and puts the order on hold', async () => {
    const f = fixture();
    f.allocation.reversals = [{ amount: '100' }];
    f.allocation.refundSources = [{ refund: { status: 'CANCELLED' } }];
    await expect(
      f.service.reverseAllocation('allocation', 'Wrong order', actor),
    ).resolves.toMatchObject({ reversed: true, orderOnHold: true });
    expect(f.tx.dealerAllocationReversal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: '700' }) as unknown,
    });
    expect(locks.refresh).toHaveBeenCalledWith(f.tx, 'order', 800n);
    f.allocation.reversals = [{ amount: '800' }];
    f.tx.dealerAllocationReversal.create.mockClear();
    await expect(f.service.reverseAllocation('allocation', 'Wrong order', actor)).resolves.toEqual({
      id: 'allocation',
      reversed: true,
    });
    expect(f.tx.dealerAllocationReversal.create).not.toHaveBeenCalled();
  });

  it.each(['missing', 'resolved', 'negative', 'overallocated'] as const)(
    'refuses invalid case resolution: %s',
    async (condition) => {
      const f = fixture();
      f.tx.dealerReconciliationCase.findUnique.mockResolvedValue(
        condition === 'missing' ? null : f.reconciliation,
      );
      if (condition === 'resolved') f.reconciliation.resolvedAt = new Date();
      if (condition === 'negative') f.reconciliation.proposedAmount = '-1001';
      if (condition === 'overallocated') f.reconciliation.proposedAmount = '-201';
      await expect(f.service.resolve('case', 'Checked', true, actor)).rejects.toThrow();
      expect(f.tx.dealerBankCorrection.create).not.toHaveBeenCalled();
      expect(f.tx.dealerReconciliationCase.update).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'resolves once, applies correction=%s and preserves another open hold',
    async (apply) => {
      const f = fixture();
      f.tx.dealerReconciliationCase.findUnique.mockResolvedValue(f.reconciliation);
      f.tx.dealerReconciliationCase.count.mockResolvedValue(apply ? 0 : 1);
      await expect(f.service.resolve('case', 'Checked', apply, actor)).resolves.toEqual({
        id: 'case',
        resolved: true,
      });
      expect(f.tx.dealerBankCorrection.create).toHaveBeenCalledTimes(apply ? 1 : 0);
      expect(f.tx.dealerBankTransaction.update).toHaveBeenCalledTimes(apply ? 1 : 0);
      expect(locks.refresh).toHaveBeenCalledWith(f.tx, 'order', 800n);
    },
  );

  it('does not release an underfunded order or money still held for reconciliation', async () => {
    const f = fixture();
    f.funding.fundingShortfall = 1n;
    await expect(f.service.releaseOrder('order', 'Checked', actor)).rejects.toThrow();
    f.funding.fundingShortfall = 0n;
    f.funding.rows = [{ bankTransaction: { reconciliationHold: true } }];
    await expect(f.service.releaseOrder('order', 'Checked', actor)).rejects.toThrow();
    expect(f.tx.dealerOrderDetail.update).not.toHaveBeenCalled();
    f.funding.rows = [{ bankTransaction: { reconciliationHold: false } }];
    await expect(f.service.releaseOrder('order', 'Checked', actor)).resolves.toEqual({
      id: 'order',
      released: true,
    });
    expect(f.tx.dealerOrderDetail.update).toHaveBeenCalledWith({
      where: { orderId: 'order' },
      data: { reconciliationHold: false },
    });
  });

  it('projects open and resolved cases without raw bank details', async () => {
    const f = fixture();
    const date = new Date('2026-10-10T00:00:00Z');
    f.tx.dealerReconciliationCase.findMany.mockResolvedValue(
      [null, date].map((resolvedAt) => ({
        ...f.reconciliation,
        resolvedAt,
        createdAt: date,
        resolutionNote: null,
        bankTransaction: { dealerId: 'dealer', bankReference: 'BANK-1', accountNumber: 'private' },
      })),
    );
    const rows = await f.service.list();
    expect(rows.map((row) => row.resolvedAt)).toEqual([null, date.toISOString()]);
    expect(rows[0]).toMatchObject({
      proposedAmount: '-100',
      dealerId: 'dealer',
      bankReference: 'BANK-1',
    });
    expect(JSON.stringify(rows)).not.toContain('private');
  });
});
