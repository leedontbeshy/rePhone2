import { describe, expect, it, vi } from 'vitest';
import {
  completeBankTransferRefund,
  getBackofficeRefund,
  getRefundEvidenceUrl,
  listBackofficeRefunds,
  RefundCommandError,
  shouldRefetchRefund,
  startRefundProcessing,
  validateRefundEvidenceFile,
} from './refund-api';

const LIST_ITEM = {
  id: '0198f1e4-9051-7af4-a157-c15223562e10',
  orderNumber: 'RPH-20260824-ABC23456',
  amount: '1000000',
  method: 'BANK_TRANSFER',
  status: 'REQUESTED',
  requestedByType: 'STAFF',
  requester: {
    id: '0198f1e4-9051-7af4-a157-c15223562e12',
    fullName: 'Nhân viên Demo',
    employeeCode: 'EMP001',
  },
  evidenceAvailable: false,
  processingAt: null,
  completedAt: null,
  terminalAt: null,
  createdAt: '2026-08-24T08:00:00.000Z',
} as const;

const DETAIL = {
  ...LIST_ITEM,
  reason: 'Hoàn cọc cho đơn hàng đã hủy',
  note: null,
  processor: null,
  terminalActor: null,
  terminalReason: null,
  availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'],
  order: {
    id: '0198f1e4-9051-7af4-a157-c15223562e11',
    orderNumber: LIST_ITEM.orderNumber,
    status: 'CANCELLED',
    fulfillmentStatus: 'CANCELLED',
    paymentStatus: 'PAID',
    customerName: 'Khách hoàn tiền',
    customerEmail: 'khach@example.com',
    grandTotal: '12000000',
    paidAmount: '3000000',
    refundedAmount: '0',
    balanceDue: '9000000',
  },
  payment: {
    id: '0198f1e4-9051-7af4-a157-c15223562e13',
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'VERIFIED',
    expectedAmount: '3000000',
    receivedAmount: '3000000',
  },
} as const;

describe('refund api adapter', () => {
  it('maps the generated flat queue DTO and drops unknown private fields', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [{ ...LIST_ITEM, evidenceObjectPath: 'must-not-leak' }],
          meta: { pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } },
        },
      }),
    };

    const result = await listBackofficeRefunds(client, {
      status: 'REQUESTED',
      method: '',
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });

    expect(client.GET).toHaveBeenCalledWith('/api/v1/backoffice/refunds', {
      params: {
        query: {
          status: 'REQUESTED',
          page: 1,
          pageSize: 20,
          sortBy: 'createdAt',
          sortOrder: 'asc',
        },
      },
    });
    expect(result.data[0]).toEqual(LIST_ITEM);
    expect(result.data[0]).not.toHaveProperty('orderId');
    expect(result.data[0]).not.toHaveProperty('reason');
    expect(result.data[0]).not.toHaveProperty('evidenceObjectPath');
  });

  it('maps the generated flat detail and does not invent finance fields', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            ...DETAIL,
            order: {
              ...DETAIL.order,
              refundableAmount: 'must-not-be-read',
              fulfillmentType: 'must-not-be-read',
            },
          },
        },
      }),
    };

    const result = await getBackofficeRefund(client, LIST_ITEM.id);

    expect(result.order).toEqual(DETAIL.order);
    expect(result.availableActions).toEqual(['START_PROCESSING', 'REJECT', 'CANCEL']);
    expect(result.order).not.toHaveProperty('refundableAmount');
    expect(result.order).not.toHaveProperty('fulfillmentType');
  });

  it('uses the command contract and preserves authoritative actions', async () => {
    const client = { POST: vi.fn().mockResolvedValue({ data: { data: DETAIL } }) };

    const result = await startRefundProcessing(
      client,
      LIST_ITEM.id,
      'Đã đối chiếu thông tin nhận tiền',
    );

    expect(client.POST).toHaveBeenCalledWith('/api/v1/backoffice/refunds/{id}/start-processing', {
      params: { path: { id: LIST_ITEM.id } },
      body: { note: 'Đã đối chiếu thông tin nhận tiền' },
    });
    expect(result.availableActions).toEqual(['START_PROCESSING', 'REJECT', 'CANCEL']);
  });

  it('serializes bank evidence as multipart without putting bytes into JSON', async () => {
    const client = { POST: vi.fn().mockResolvedValue({ data: { data: DETAIL } }) };
    const file = new File(['proof'], 'hoan-tien.pdf', { type: 'application/pdf' });

    await completeBankTransferRefund(client, LIST_ITEM.id, file, 'Đã chuyển khoản thành công');

    const options = client.POST.mock.calls[0]?.[1] as {
      body: unknown;
      bodySerializer: () => FormData;
    };
    expect(options.body).toEqual({ file, note: 'Đã chuyển khoản thành công' });
    expect(options.bodySerializer().get('file')).toBe(file);
    expect(options.bodySerializer().get('note')).toBe('Đã chuyển khoản thành công');
  });

  it('validates evidence type and size before upload', () => {
    expect(
      validateRefundEvidenceFile(new File(['proof'], 'hoan-tien.pdf', { type: 'application/pdf' })),
    ).toBeNull();
    expect(validateRefundEvidenceFile(new File([], 'trong.pdf', { type: 'application/pdf' }))).toBe(
      'Tệp minh chứng đang trống.',
    );
    expect(
      validateRefundEvidenceFile(new File(['x'], 'hoan-tien.txt', { type: 'text/plain' })),
    ).toBe('Chỉ nhận tệp JPEG, PNG, WebP hoặc PDF.');
  });

  it('keeps conflict codes so the detail view can refetch authoritatively', async () => {
    const client = {
      POST: vi.fn().mockResolvedValue({
        error: { error: { code: 'CONCURRENT_MODIFICATION', message: 'unsafe' } },
      }),
    };

    const caught = await startRefundProcessing(client, LIST_ITEM.id).catch(
      (error: unknown) => error,
    );

    expect(caught).toBeInstanceOf(RefundCommandError);
    expect(shouldRefetchRefund(caught)).toBe(true);
    expect((caught as Error).message).not.toContain('unsafe');
  });

  it('requests a fresh safe evidence URL', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            url: 'https://storage.example.test/refund.pdf',
            expiresAt: '2026-08-29T10:05:00.000Z',
          },
        },
      }),
    };

    await expect(getRefundEvidenceUrl(client, LIST_ITEM.id)).resolves.toEqual({
      url: 'https://storage.example.test/refund.pdf',
      expiresAt: '2026-08-29T10:05:00.000Z',
    });
    expect(client.GET).toHaveBeenCalledTimes(1);
  });
});
