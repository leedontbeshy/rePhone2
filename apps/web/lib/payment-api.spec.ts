import { describe, expect, it, vi } from 'vitest';
import {
  customerPaymentError,
  getBackofficePayment,
  getPaymentEvidenceUrl,
  listBackofficePayments,
  paymentError,
  submitPaymentProof,
  validateCustomerPaymentProof,
} from './payment-api';
import type { CustomerPaymentError } from './payment-api';

const PUBLIC_PAYMENT = {
  id: '5ce2cbde-68b8-44cf-b979-125415f2fb76',
  orderNumber: 'RPH-20260822-ABC23456',
  purpose: 'DEPOSIT',
  method: 'BANK_TRANSFER',
  status: 'UNDER_REVIEW',
  expectedAmount: '1000000',
  receivedAmount: null,
  transferContent: 'RPH20260822ABC23456',
  bankTransferInstructions: {
    bankName: 'Demo Bank',
    accountNumber: '123456789',
    accountHolder: 'REPHONE',
    qrUrl: null,
    transferContent: 'RPH20260822ABC23456',
  },
  expiresAt: null,
  submittedAt: '2026-08-22T10:00:00.000Z',
  reviewSlaDueAt: '2026-08-22T10:30:00.000Z',
  reviewOverdue: false,
  rejectionReason: null,
};

describe('payment api adapter', () => {
  it('validates proof files and builds a guest multipart request only when supplied', async () => {
    const client = { POST: vi.fn().mockResolvedValue({ data: { data: PUBLIC_PAYMENT } }) };
    const file = new File(['proof'], 'proof.png', { type: 'image/png' });
    expect(validateCustomerPaymentProof(file)).toBeNull();
    await submitPaymentProof(client, PUBLIC_PAYMENT.id, file);
    expect(client.POST.mock.calls[0]?.[1]).toMatchObject({
      params: { path: { paymentId: PUBLIC_PAYMENT.id }, header: { 'X-Rephone-CSRF': '1' } },
    });
    expect(
      validateCustomerPaymentProof(new File(['x'], 'proof.txt', { type: 'text/plain' })),
    ).toContain('JPEG');
  });

  it.each([
    'PAYMENT_PROOF_DEADLINE_PASSED',
    'PAYMENT_ALREADY_REVIEWED',
    'INVALID_STATE_TRANSITION',
    'CONCURRENT_MODIFICATION',
  ])('returns a typed refetch signal for %s', async (code) => {
    const client = {
      POST: vi.fn().mockResolvedValue({ error: { error: { code, message: 'private detail' } } }),
    };
    const file = new File(['proof'], 'proof.png', { type: 'image/png' });
    await expect(submitPaymentProof(client, PUBLIC_PAYMENT.id, file)).rejects.toMatchObject({
      name: 'CustomerPaymentError',
      code,
      requiresOrderRefetch: true,
    } satisfies Partial<CustomerPaymentError>);
  });
  it('maps the backoffice queue response without exposing evidence fields', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              ...PUBLIC_PAYMENT,
              customerName: 'Nguyễn Văn A',
              customerEmail: 'customer@example.com',
              fulfillmentType: 'SHIPPING',
              createdAt: '2026-08-22T09:55:00.000Z',
              evidenceBucket: 'must-not-be-read',
              evidenceObjectPath: 'must-not-be-read',
            },
          ],
          meta: {
            pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
          },
        },
      }),
    };

    const result = await listBackofficePayments(client, {
      status: 'UNDER_REVIEW',
      page: 1,
      pageSize: 20,
      sortBy: 'submittedAt',
      sortOrder: 'asc',
    });

    expect(result.data[0]).toMatchObject({
      orderNumber: PUBLIC_PAYMENT.orderNumber,
      contactName: 'Nguyễn Văn A',
      contactEmail: 'customer@example.com',
    });
    expect(result.data[0]).not.toHaveProperty('evidenceBucket');
    expect(result.data[0]).not.toHaveProperty('evidenceObjectPath');
  });

  it('maps flattened backoffice order contact and a safe timeline', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            payment: PUBLIC_PAYMENT,
            evidenceAvailable: true,
            order: {
              orderNumber: PUBLIC_PAYMENT.orderNumber,
              status: 'PLACED',
              fulfillmentStatus: 'PENDING',
              paymentStatus: 'UNPAID',
              customerName: 'Nguyễn Văn A',
              customerEmail: 'customer@example.com',
              customerPhone: '0900000000',
              items: [],
              grandTotal: '10000000',
              depositRequired: '1000000',
              paidAmount: '0',
              refundedAmount: '0',
              balanceDue: '10000000',
            },
            reviewer: null,
            reviewedAt: null,
          },
        },
      }),
    };

    const result = await getBackofficePayment(client, PUBLIC_PAYMENT.id);

    expect(result.order.contact).toEqual({
      fullName: 'Nguyễn Văn A',
      email: 'customer@example.com',
      phone: '0900000000',
    });
    expect(result.timeline).toEqual([
      { label: 'Đã nộp minh chứng', at: PUBLIC_PAYMENT.submittedAt },
    ]);
  });

  it('rejects non-http evidence URLs and maps stable payment errors', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({ data: { data: { url: 'javascript:alert(1)' } } }),
    };

    await expect(getPaymentEvidenceUrl(client, PUBLIC_PAYMENT.id)).rejects.toThrow(
      'Không thể mở minh chứng lúc này.',
    );
    expect(
      paymentError(
        { error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'unsupported' } },
        'fallback',
      ),
    ).toBe('Chỉ nhận JPEG, PNG, WebP hoặc PDF hợp lệ.');
    expect(
      customerPaymentError(
        { error: { code: 'CSRF_VALIDATION_FAILED', message: 'private transport detail' } },
        'Không thể nộp minh chứng thanh toán.',
      ),
    ).toBe('Không thể xác nhận yêu cầu. Hãy tải lại trang rồi thử lại.');
    expect(
      customerPaymentError(
        { error: { code: 'UNKNOWN_PAYMENT_ERROR', message: 'private server detail' } },
        'Không thể nộp minh chứng thanh toán.',
      ),
    ).toBe('Không thể nộp minh chứng thanh toán.');
    expect(
      paymentError(
        { error: { code: 'BACKOFFICE_DIAGNOSTIC', message: 'Chi tiết phục vụ vận hành.' } },
        'fallback',
      ),
    ).toBe('Chi tiết phục vụ vận hành.');
  });
});
