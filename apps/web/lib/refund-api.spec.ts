import { describe, expect, it, vi } from 'vitest';
import {
  completeBankTransferRefund,
  createRefund,
  getBackofficeRefund,
  getRefundEvidenceUrl,
  listBackofficeRefunds,
  refundError,
  startRefundProcessing,
} from './refund-api';

const REFUND = {
  id: '0198f1e4-9051-7af4-a157-c15223562e10',
  orderId: '0198f1e4-9051-7af4-a157-c15223562e11',
  amount: '1000000',
  method: 'BANK_TRANSFER',
  status: 'REQUESTED',
  reason: 'Hoàn cọc cho đơn hàng hoàn về',
  requestedByType: 'STAFF',
  requestedBy: {
    id: '0198f1e4-9051-7af4-a157-c15223562e12',
    fullName: 'Nhân viên Demo',
    employeeCode: 'EMP001',
  },
  processingAt: null,
  completedAt: null,
  terminalAt: null,
  createdAt: '2026-08-24T08:00:00.000Z',
};

const DETAIL = {
  refund: REFUND,
  order: {
    id: REFUND.orderId,
    orderNumber: 'RPH-20260824-ABC23456',
    status: 'CANCELLED',
    fulfillmentStatus: 'CANCELLED',
    paymentStatus: 'PAID',
    fulfillmentType: 'SHIPPING',
    customerName: 'Khách hoàn tiền',
    pricing: {
      paidAmount: '1000000',
      refundedAmount: '0',
      refundableAmount: '1000000',
    },
  },
  payment: {
    id: '0198f1e4-9051-7af4-a157-c15223562e13',
    purpose: 'DEPOSIT',
    method: 'BANK_TRANSFER',
    status: 'VERIFIED',
    expectedAmount: '1000000',
    receivedAmount: '1000000',
  },
  availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'],
  evidenceAvailable: false,
};

describe('refund api adapter', () => {
  it('maps a safe paginated queue and removes private evidence metadata', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              ...REFUND,
              orderNumber: 'RPH-20260824-ABC23456',
              evidenceBucket: 'must-not-be-read',
              evidenceObjectPath: 'must-not-be-read',
              evidenceSha256: 'must-not-be-read',
            },
          ],
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
    expect(result.data[0]).toMatchObject({
      amount: '1000000',
      requester: { fullName: 'Nhân viên Demo' },
    });
    expect(result.data[0]).not.toHaveProperty('evidenceBucket');
    expect(result.data[0]).not.toHaveProperty('evidenceObjectPath');
    expect(result.data[0]).not.toHaveProperty('evidenceSha256');
  });

  it('maps detail, finance summary, timeline and authoritative actions', async () => {
    const client = { GET: vi.fn().mockResolvedValue({ data: { data: DETAIL } }) };

    const result = await getBackofficeRefund(client, REFUND.id);

    expect(result.order).toMatchObject({
      orderNumber: 'RPH-20260824-ABC23456',
      refundableAmount: '1000000',
    });
    expect(result.payment).toMatchObject({ status: 'VERIFIED', receivedAmount: '1000000' });
    expect(result.availableActions).toEqual(['START_PROCESSING', 'REJECT', 'CANCEL']);
    expect(result.timeline).toEqual([{ label: 'Đã tạo yêu cầu', at: '2026-08-24T08:00:00.000Z' }]);
  });

  it('uses the create and start-processing contracts', async () => {
    const client = { POST: vi.fn().mockResolvedValue({ data: { data: DETAIL } }) };

    await createRefund(client, REFUND.orderId, {
      amount: '1000000',
      method: 'BANK_TRANSFER',
      reason: 'Hoàn cọc cho đơn hàng hoàn về',
    });
    await startRefundProcessing(client, REFUND.id, 'Đã đối chiếu tài khoản nhận');

    expect(client.POST.mock.calls[0]).toEqual([
      '/api/v1/backoffice/orders/{id}/refunds',
      {
        params: { path: { id: REFUND.orderId } },
        body: {
          amount: '1000000',
          method: 'BANK_TRANSFER',
          reason: 'Hoàn cọc cho đơn hàng hoàn về',
        },
      },
    ]);
    expect(client.POST.mock.calls[1]).toEqual([
      '/api/v1/backoffice/refunds/{id}/start-processing',
      {
        params: { path: { id: REFUND.id } },
        body: { note: 'Đã đối chiếu tài khoản nhận' },
      },
    ]);
  });

  it('serializes bank evidence as multipart and never puts bytes in JSON', async () => {
    const client = { POST: vi.fn().mockResolvedValue({ data: { data: DETAIL } }) };
    const file = new File(['proof'], 'refund.pdf', { type: 'application/pdf' });

    await completeBankTransferRefund(client, REFUND.id, file, 'Đã chuyển khoản thành công');

    const options = client.POST.mock.calls[0]?.[1] as {
      body: unknown;
      bodySerializer: () => FormData;
    };
    expect(options.body).toEqual({ file, note: 'Đã chuyển khoản thành công' });
    expect(options.bodySerializer()).toBeInstanceOf(FormData);
    expect(options.bodySerializer().get('file')).toBeInstanceOf(File);
  });

  it('rejects credential-bearing evidence URLs and maps stable finance errors', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: { data: { url: 'https://user:password@storage.example/refund' } },
      }),
    };

    await expect(getRefundEvidenceUrl(client, REFUND.id)).rejects.toThrow(
      'Phản hồi signed URL không hợp lệ.',
    );
    expect(
      refundError(
        { error: { code: 'REFUND_AMOUNT_EXCEEDS_PAID', message: 'unsafe detail' } },
        'fallback',
      ),
    ).toBe('Số tiền hoàn vượt quá khoản đã thu còn có thể hoàn.');
  });
});
