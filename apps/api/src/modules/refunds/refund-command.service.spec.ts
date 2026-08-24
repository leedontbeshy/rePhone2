/* eslint-disable @typescript-eslint/require-await */
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../../common/providers/storage-provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { RefundNotificationService } from '../notifications/refund-notification.service.js';
import type { RefundOrderGateway } from '../order-transaction-ports/refund-order.gateway.js';
import type { RefundPaymentGateway } from '../payments/refund-payment.gateway.js';
import type { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import { RefundCommandService } from './refund-command.service.js';
import { RefundCoreGateway, type LockedRefundFinance } from './refund-core.gateway.js';
import type {
  RefundOperationsRecord,
  RefundOperationsRepository,
} from './refund-operations.repository.js';

const ORDER_ID = cryptoId(1);
const PAYMENT_ID = cryptoId(2);
const SECOND_PAYMENT_ID = cryptoId(3);
const REFUND_ID = cryptoId(4);
const STAFF_ID = cryptoId(5);
const NOW = new Date('2026-08-24T05:00:00.000Z');

describe('RefundCommandService.create', () => {
  it('rejects an amount above all currently uncovered verified money', async () => {
    const fixture = commandFixture({
      finance: {
        payments: [verifiedPayment(PAYMENT_ID, '500000')],
        refunds: [refundFinance('REQUESTED', '200000')],
      },
    });

    await expect(
      fixture.service.create(
        ORDER_ID,
        {
          amount: '300001',
          method: 'BANK_TRANSFER',
          reason: 'Hoàn vượt phần tiền còn khả dụng',
        },
        staffAuth(),
        staffRequest(),
      ),
    ).rejects.toMatchObject({ code: 'REFUND_AMOUNT_EXCEEDS_PAID' });

    expect(fixture.refundCreate).not.toHaveBeenCalled();
    expect(fixture.audit.write).not.toHaveBeenCalled();
  });

  it('enforces the selected Payment cap in addition to the Order aggregate cap', async () => {
    const fixture = commandFixture({
      finance: {
        payments: [
          verifiedPayment(PAYMENT_ID, '100000'),
          verifiedPayment(SECOND_PAYMENT_ID, '900000'),
        ],
        refunds: [],
      },
    });

    await expect(
      fixture.service.create(
        ORDER_ID,
        {
          paymentId: PAYMENT_ID,
          amount: '100001',
          method: 'CASH',
          reason: 'Khoản hoàn vượt riêng payment nguồn',
        },
        staffAuth(),
        staffRequest(),
      ),
    ).rejects.toMatchObject({ code: 'REFUND_AMOUNT_EXCEEDS_PAID' });

    expect(fixture.refundCreate).not.toHaveBeenCalled();
  });

  it('checks the order lifecycle before locking finance or creating an obligation', async () => {
    const fixture = commandFixture({ orderStatus: 'PROCESSING' });

    await expect(
      fixture.service.create(
        ORDER_ID,
        {
          amount: '100000',
          method: 'CASH',
          reason: 'Đơn chưa ở trạng thái cho phép hoàn',
        },
        staffAuth(),
        staffRequest(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    expect(fixture.lockFinance).not.toHaveBeenCalled();
    expect(fixture.refundCreate).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'COMPLETED'] as const)(
    'creates a staff obligation for an eligible %s order',
    async (orderStatus) => {
      const fixture = commandFixture({
        orderStatus,
        finance: {
          payments: [verifiedPayment(PAYMENT_ID, '500000')],
          refunds: [],
        },
      });

      await expect(
        fixture.service.create(
          ORDER_ID,
          {
            paymentId: PAYMENT_ID,
            amount: '250000',
            method: 'BANK_TRANSFER',
            reason: 'Hoàn một phần cho khách hàng',
          },
          staffAuth(),
          staffRequest(),
        ),
      ).resolves.toMatchObject({ id: REFUND_ID, status: 'REQUESTED', amount: '250000' });

      expect(fixture.refundCreate.mock.calls[0]?.[0]).toMatchObject({
        data: {
          orderId: ORDER_ID,
          paymentId: PAYMENT_ID,
          amount: '250000',
          method: 'BANK_TRANSFER',
          status: 'REQUESTED',
          reason: 'Hoàn một phần cho khách hàng',
          requestedByType: 'STAFF',
          requestedById: STAFF_ID,
        },
      });
      expect(fixture.audit.write.mock.calls[0]?.[2]).toMatchObject({
        action: 'refund.created',
        resourceType: 'Refund',
        resourceId: REFUND_ID,
      });
    },
  );
});

function commandFixture(
  options: {
    orderStatus?: string;
    finance?: LockedRefundFinance;
  } = {},
) {
  const orderStatus = options.orderStatus ?? 'CANCELLED';
  const finance = options.finance ?? {
    payments: [verifiedPayment(PAYMENT_ID, '500000')],
    refunds: [],
  };
  const refundCreate = vi.fn(async (input: unknown) => {
    void input;
    return { id: REFUND_ID };
  });
  const transaction = {
    $queryRaw: vi.fn(async () => [{ id: ORDER_ID }]),
    order: {
      findUnique: vi.fn(async () => ({
        id: ORDER_ID,
        orderNumber: 'RPH-20260824-REFUND01',
        status: orderStatus,
      })),
    },
    refund: { create: refundCreate },
  } as unknown as Prisma.TransactionClient;
  const transactions = {
    run: vi.fn(
      async (
        _operation: string,
        work: (client: Prisma.TransactionClient) => Promise<unknown>,
      ): Promise<unknown> => work(transaction),
    ),
  };
  const core = new RefundCoreGateway({} as RefundPaymentGateway);
  const lockFinance = vi.spyOn(core, 'lockFinance').mockResolvedValue(finance);
  const orders = {
    lockById: vi.fn(async () => ({
      id: ORDER_ID,
      orderNumber: 'RPH-20260824-REFUND01',
      status: orderStatus,
      grandTotal: '1000000',
    })),
  };
  const record = refundRecord({
    order: {
      ...refundRecord().order,
      status: orderStatus as RefundOperationsRecord['order']['status'],
    },
  });
  const repository = {
    findById: vi.fn(async () => record),
  };
  const audit = {
    write: vi.fn(async (auditTransaction: unknown, actor: unknown, entry: unknown) => {
      void auditTransaction;
      void actor;
      void entry;
    }),
  };
  const service = new RefundCommandService(
    transactions as unknown as SerializableTransactionRunner,
    core,
    orders as unknown as RefundOrderGateway,
    repository as unknown as RefundOperationsRepository,
    {} as PrivateEvidenceValidator,
    {} as StorageProvider,
    { storage: { privateBucket: 'rephone-private' } } as AppConfig,
    audit as unknown as AuditWriter,
    { now: () => NOW },
    {} as RefundNotificationService,
  );
  return { service, transaction, refundCreate, lockFinance, repository, audit };
}

function verifiedPayment(id: string, receivedAmount: string) {
  return {
    id,
    method: 'BANK_TRANSFER' as const,
    status: 'VERIFIED' as const,
    expectedAmount: receivedAmount,
    receivedAmount,
  };
}

function refundFinance(status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED', amount: string) {
  return {
    id: cryptoId(20),
    paymentId: PAYMENT_ID,
    amount,
    method: 'BANK_TRANSFER' as const,
    status,
  };
}

function refundRecord(overrides: Partial<RefundOperationsRecord> = {}): RefundOperationsRecord {
  return {
    id: REFUND_ID,
    orderId: ORDER_ID,
    paymentId: PAYMENT_ID,
    amount: 250_000n,
    method: 'BANK_TRANSFER',
    status: 'REQUESTED',
    reason: 'Hoàn một phần cho khách hàng',
    note: null,
    requestedByType: 'STAFF',
    requestedById: STAFF_ID,
    processedById: null,
    processingAt: null,
    completedAt: null,
    terminalById: null,
    terminalAt: null,
    terminalReason: null,
    evidenceBucket: null,
    evidenceObjectPath: null,
    evidenceMimeType: null,
    evidenceFileSize: null,
    evidenceSha256: null,
    createdAt: NOW,
    updatedAt: NOW,
    order: {
      id: ORDER_ID,
      orderNumber: 'RPH-20260824-REFUND01',
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      paymentStatus: 'PARTIALLY_PAID',
      customerName: 'Khách hoàn tiền',
      customerEmail: 'refund@example.com',
      grandTotal: 1_000_000n,
      paidAmount: 500_000n,
      refundedAmount: 0n,
      balanceDue: 500_000n,
    },
    payment: {
      id: PAYMENT_ID,
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status: 'VERIFIED',
      expectedAmount: 500_000n,
      receivedAmount: 500_000n,
    },
    requestedBy: {
      id: STAFF_ID,
      fullName: 'Nhân viên refund',
      employeeCode: 'NV-REFUND',
    },
    processedBy: null,
    terminalBy: null,
    ...overrides,
  } as RefundOperationsRecord;
}

function staffAuth(): AuthContext {
  return { userId: STAFF_ID, role: 'EMPLOYEE' } as AuthContext;
}

function staffRequest(): Request {
  return {
    id: 'request-refund-create',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn((name: string) => (name === 'user-agent' ? 'vitest' : undefined)),
  } as unknown as Request;
}

function cryptoId(suffix: number): string {
  return `0198e5a0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
