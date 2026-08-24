/* eslint-disable @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  LockedRefundPayment,
  RefundPaymentGateway,
} from '../payments/refund-payment.gateway.js';
import {
  RefundCoreGateway,
  type LockedRefundFinance,
  type LockedRefundRecord,
} from './refund-core.gateway.js';

const ORDER_ID = '0198e5a0-0000-7000-8000-000000000001';
const PAYMENT_ID = '0198e5a0-0000-7000-8000-000000000002';
const STAFF_ID = '0198e5a0-0000-7000-8000-000000000003';
const NOW = new Date('2026-08-24T03:00:00.000Z');

describe('RefundCoreGateway', () => {
  let gateway: RefundCoreGateway;
  let payments: {
    lockForRefund: ReturnType<typeof vi.fn>;
    cancelAwaitingProof: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    payments = {
      lockForRefund: vi.fn(async () => []),
      cancelAwaitingProof: vi.fn(async () => ({ count: 0 })),
    };
    gateway = new RefundCoreGateway(payments as unknown as RefundPaymentGateway);
  });

  it('calculates verified, covered, completed and available totals with BigInt', () => {
    const finance = refundFinance({
      payments: [
        payment({ id: PAYMENT_ID, receivedAmount: '1000000' }),
        payment({ id: cryptoId(4), receivedAmount: '500000' }),
        payment({ id: cryptoId(5), status: 'CANCELLED', receivedAmount: null }),
      ],
      refunds: [
        refund({ id: cryptoId(10), paymentId: PAYMENT_ID, status: 'REQUESTED', amount: '200000' }),
        refund({ id: cryptoId(11), paymentId: PAYMENT_ID, status: 'PROCESSING', amount: '300000' }),
        refund({ id: cryptoId(12), paymentId: cryptoId(4), status: 'COMPLETED', amount: '400000' }),
        refund({ id: cryptoId(13), status: 'REJECTED', amount: '800000' }),
        refund({ id: cryptoId(14), status: 'CANCELLED', amount: '900000' }),
      ],
    });

    expect(gateway.verifiedTotal(finance)).toBe(1_500_000n);
    expect(gateway.coveredTotal(finance)).toBe(900_000n);
    expect(gateway.completedTotal(finance)).toBe(400_000n);
    expect(gateway.completedTotal(finance, cryptoId(11))).toBe(700_000n);
    expect(gateway.availableTotal(finance)).toBe(600_000n);
    expect(gateway.availableForPayment(finance, PAYMENT_ID)).toBe(500_000n);
  });

  it('fails closed when persisted refund coverage exceeds verified money', () => {
    const finance = refundFinance({
      payments: [payment({ receivedAmount: '100000' })],
      refunds: [refund({ amount: '100001', status: 'REQUESTED' })],
    });

    expect(() => gateway.availableTotal(finance)).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' }) as ApiError,
    );
    expect(() => gateway.availableForPayment(finance, PAYMENT_ID)).toThrow(
      expect.objectContaining({ code: 'INTERNAL_ERROR' }) as ApiError,
    );
  });

  it('rejects a missing, cancelled or unverified payment as a manual-refund source', () => {
    const finance = refundFinance({
      payments: [payment({ status: 'CANCELLED', receivedAmount: null })],
    });

    for (const paymentId of [PAYMENT_ID, cryptoId(99)]) {
      expect(() => gateway.availableForPayment(finance, paymentId)).toThrow(
        expect.objectContaining({
          code: 'VALIDATION_FAILED',
          details: [expect.objectContaining({ code: 'PAYMENT_NOT_REFUNDABLE' })],
        }) as ApiError,
      );
    }
  });

  it('creates exactly the uncovered cancellation obligation and links a single verified payment', async () => {
    const transaction = cancellationTransaction();
    vi.spyOn(gateway, 'lockFinance').mockResolvedValueOnce(
      refundFinance({
        payments: [payment({ receivedAmount: '1000000' })],
        refunds: [refund({ status: 'COMPLETED', amount: '250000' })],
      }),
    );

    await expect(
      gateway.prepareCancellationRefund(
        {
          orderId: ORDER_ID,
          reason: 'Khách đổi kế hoạch nhận hàng',
          now: NOW,
          actor: { requesterType: 'STAFF', requesterId: STAFF_ID },
        },
        transaction.client,
      ),
    ).resolves.toEqual({ id: cryptoId(50), amount: '750000' });

    expect(payments.cancelAwaitingProof).toHaveBeenCalledWith(ORDER_ID, transaction.client);
    expect(transaction.refundCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amount: '750000',
        method: 'BANK_TRANSFER',
        status: 'REQUESTED',
        requestedByType: 'STAFF',
        requestedById: STAFF_ID,
        createdAt: NOW,
      },
    });
  });

  it('leaves paymentId null when cancellation aggregates more than one verified source', async () => {
    const transaction = cancellationTransaction();
    vi.spyOn(gateway, 'lockFinance').mockResolvedValueOnce(
      refundFinance({
        payments: [
          payment({ receivedAmount: '400000' }),
          payment({ id: cryptoId(4), receivedAmount: '600000' }),
        ],
      }),
    );

    await gateway.prepareCancellationRefund(
      {
        orderId: ORDER_ID,
        reason: 'Đơn đã quay về cửa hàng',
        now: NOW,
        actor: { requesterType: 'SYSTEM', requesterId: null },
      },
      transaction.client,
    );

    expect(transaction.refundCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { paymentId: null, amount: '1000000' },
    });
  });

  it('cancels an awaiting proof without creating a zero-value refund obligation', async () => {
    const transaction = cancellationTransaction();
    vi.spyOn(gateway, 'lockFinance').mockResolvedValueOnce(
      refundFinance({ payments: [payment({ status: 'AWAITING_PROOF', receivedAmount: null })] }),
    );

    await expect(
      gateway.prepareCancellationRefund(
        {
          orderId: ORDER_ID,
          reason: 'Khách yêu cầu hủy đơn',
          now: NOW,
          actor: { requesterType: 'CUSTOMER', requesterId: null },
        },
        transaction.client,
      ),
    ).resolves.toBeNull();

    expect(payments.cancelAwaitingProof).toHaveBeenCalledOnce();
    expect(transaction.refundCreate).not.toHaveBeenCalled();
  });

  it('blocks cancellation while proof is under review before changing payment or refund state', async () => {
    const transaction = cancellationTransaction();
    vi.spyOn(gateway, 'lockFinance').mockResolvedValueOnce(
      refundFinance({ payments: [payment({ status: 'UNDER_REVIEW', receivedAmount: null })] }),
    );

    await expect(
      gateway.prepareCancellationRefund(
        {
          orderId: ORDER_ID,
          reason: 'Không được hủy khi đang duyệt proof',
          now: NOW,
          actor: { requesterType: 'STAFF', requesterId: STAFF_ID },
        },
        transaction.client,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' } satisfies Partial<ApiError>);

    expect(payments.cancelAwaitingProof).not.toHaveBeenCalled();
    expect(transaction.refundCreate).not.toHaveBeenCalled();
  });
});

function refundFinance(overrides: Partial<LockedRefundFinance> = {}): LockedRefundFinance {
  return { payments: [], refunds: [], ...overrides };
}

function payment(overrides: Partial<LockedRefundPayment> = {}): LockedRefundPayment {
  return {
    id: PAYMENT_ID,
    method: 'BANK_TRANSFER',
    status: 'VERIFIED',
    expectedAmount: '1000000',
    receivedAmount: '1000000',
    ...overrides,
  };
}

function refund(overrides: Partial<LockedRefundRecord> = {}): LockedRefundRecord {
  return {
    id: cryptoId(10),
    paymentId: PAYMENT_ID,
    amount: '100000',
    method: 'BANK_TRANSFER',
    status: 'REQUESTED',
    ...overrides,
  };
}

function cancellationTransaction() {
  const refundCreate = vi.fn(async (input: unknown) => {
    void input;
    return { id: cryptoId(50), amount: 750_000n };
  });
  const client = {
    refund: { create: refundCreate },
  } as unknown as Prisma.TransactionClient;
  return { client, refundCreate };
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
