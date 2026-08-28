import { describe, expect, it, vi } from 'vitest';
import {
  activateVoucher,
  archiveVoucher,
  createVoucher,
  getVoucher,
  listVoucherUsages,
  listVouchers,
  pauseVoucher,
  updateVoucher,
  voucherAdminError,
  voucherDiscountSummary,
  voucherErrorRequiresRefetch,
  voucherScopeSummary,
  voucherStatusLabel,
  voucherUsageStatusLabel,
  type CreateVoucherInput,
  type Voucher,
  type VoucherApiClient,
} from './backoffice-voucher-api';

const VOUCHER_ID = '0199c9aa-a258-74c8-a35f-9cd11c562aa1';
const VOUCHER: Voucher = {
  id: VOUCHER_ID,
  code: 'IPHONE10',
  name: 'Ưu đãi iPhone tháng 9',
  description: 'Giảm giá cho dòng iPhone.',
  discountType: 'PERCENT',
  discountValue: '10',
  maxDiscountAmount: '1500000',
  minimumOrderAmount: '10000000',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-09-30T23:59:59.000Z',
  totalUsageLimit: 300,
  perCustomerLimit: null,
  visibility: 'PUBLIC',
  scopeType: 'PRODUCT_TYPE',
  scopeConfig: { productType: 'IPHONE' },
  status: 'DRAFT',
  usageCounts: { reserved: 3, consumed: 128, released: 6 },
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
};

const CREATE_INPUT: CreateVoucherInput = {
  code: ' iphone10 ',
  name: VOUCHER.name,
  description: VOUCHER.description ?? null,
  discountType: VOUCHER.discountType,
  discountValue: VOUCHER.discountValue,
  maxDiscountAmount: VOUCHER.maxDiscountAmount ?? null,
  minimumOrderAmount: VOUCHER.minimumOrderAmount,
  startsAt: VOUCHER.startsAt,
  endsAt: VOUCHER.endsAt,
  totalUsageLimit: VOUCHER.totalUsageLimit ?? null,
  perCustomerLimit: VOUCHER.perCustomerLimit ?? null,
  visibility: VOUCHER.visibility,
  scopeType: 'PRODUCT_TYPE',
  scopeConfig: { productType: 'IPHONE' },
};

describe('backoffice voucher typed-client adapter', () => {
  it('compacts list filters and maps the server pagination envelope', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [VOUCHER],
        meta: { pagination: { page: 2, pageSize: 12, totalItems: 14, totalPages: 2 } },
      },
    });

    const result = await listVouchers(mockClient({ GET: get }), {
      q: '  IPHONE  ',
      status: 'DRAFT',
      discountType: '',
      scopeType: 'PRODUCT_TYPE',
      visibility: '',
      page: 2,
      pageSize: 12,
    });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/vouchers', {
      params: {
        query: {
          q: 'IPHONE',
          status: 'DRAFT',
          scopeType: 'PRODUCT_TYPE',
          page: 2,
          pageSize: 12,
        },
      },
    });
    expect(result).toEqual({
      data: [VOUCHER],
      pagination: { page: 2, pageSize: 12, totalItems: 14, totalPages: 2 },
    });
  });

  it('gets, creates and updates vouchers through the generated contract', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: VOUCHER } });
    const post = vi.fn().mockResolvedValue({ data: { data: VOUCHER } });
    const patch = vi.fn().mockResolvedValue({ data: { data: { ...VOUCHER, name: 'Tên mới' } } });
    const client = mockClient({ GET: get, POST: post, PATCH: patch });

    await getVoucher(client, VOUCHER_ID);
    await createVoucher(client, CREATE_INPUT);
    await updateVoucher(client, VOUCHER_ID, { name: 'Tên mới' });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/vouchers/{id}', {
      params: { path: { id: VOUCHER_ID } },
    });
    expect(post).toHaveBeenCalledWith('/api/v1/backoffice/vouchers', {
      body: { ...CREATE_INPUT, code: 'IPHONE10' },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/vouchers/{id}', {
      params: { path: { id: VOUCHER_ID } },
      body: { name: 'Tên mới' },
    });
  });

  it('uses exact lifecycle routes and trims required reasons', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: VOUCHER } });
    const client = mockClient({ POST: post });

    await activateVoucher(client, VOUCHER_ID);
    await pauseVoucher(client, VOUCHER_ID, '  Chờ cập nhật nội dung  ');
    await archiveVoucher(client, VOUCHER_ID, '  Chương trình đã kết thúc  ');

    expect(post.mock.calls).toEqual([
      ['/api/v1/backoffice/vouchers/{id}/activate', { params: { path: { id: VOUCHER_ID } } }],
      [
        '/api/v1/backoffice/vouchers/{id}/pause',
        {
          params: { path: { id: VOUCHER_ID } },
          body: { reason: 'Chờ cập nhật nội dung' },
        },
      ],
      [
        '/api/v1/backoffice/vouchers/{id}/archive',
        {
          params: { path: { id: VOUCHER_ID } },
          body: { reason: 'Chương trình đã kết thúc' },
        },
      ],
    ]);
  });

  it('projects friendly order and customer fields for usage history', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: '0199c9aa-a258-74c8-a35f-9cd11c562aa2',
            orderId: '0199c9aa-a258-74c8-a35f-9cd11c562aa3',
            orderNumber: 'RPH-20260828-4QR95VS9',
            customerId: '0199c9aa-a258-74c8-a35f-9cd11c562aa4',
            customer: { name: 'Nguyễn Hoàng Nam', email: 'nam@example.com' },
            status: 'CONSUMED',
            createdAt: '2026-08-28T07:32:00.000Z',
            consumedAt: '2026-08-28T07:33:00.000Z',
            releasedAt: null,
          },
          {
            id: '0199c9aa-a258-74c8-a35f-9cd11c562aa5',
            orderId: '0199c9aa-a258-74c8-a35f-9cd11c562aa6',
            orderNumber: 'RPH-20260828-8TJCUZHZ',
            customerId: null,
            customer: null,
            status: 'RESERVED',
            createdAt: '2026-08-28T06:08:00.000Z',
            consumedAt: null,
            releasedAt: null,
          },
        ],
        meta: { pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } },
      },
    });

    const result = await listVoucherUsages(mockClient({ GET: get }), VOUCHER_ID, {
      status: 'CONSUMED',
      page: 1,
      pageSize: 20,
    });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/vouchers/{id}/usages', {
      params: {
        path: { id: VOUCHER_ID },
        query: { status: 'CONSUMED', page: 1, pageSize: 20 },
      },
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        orderNumber: 'RPH-20260828-4QR95VS9',
        customerName: 'Nguyễn Hoàng Nam',
        customerEmail: 'nam@example.com',
      }),
      expect.objectContaining({
        orderNumber: 'RPH-20260828-8TJCUZHZ',
        customerName: 'Khách mua không cần tài khoản',
        customerEmail: null,
      }),
    ]);
    expect(result.data[0]).not.toHaveProperty('customerId');
  });

  it('provides natural Vietnamese labels and summaries instead of raw enum values', () => {
    expect(voucherStatusLabel('ACTIVE')).toBe('Đang áp dụng');
    expect(voucherUsageStatusLabel('RELEASED')).toBe('Đã hoàn lại');
    expect(voucherScopeSummary(VOUCHER)).toBe('Dòng iPhone');
    expect(
      voucherScopeSummary({ scopeType: 'PRODUCTS', scopeConfig: { productIds: ['a', 'b'] } }),
    ).toBe('2 sản phẩm đã chọn');
    expect(voucherDiscountSummary(VOUCHER)).toBe('Giảm 10%, tối đa 1.500.000 ₫');
  });

  it('maps stable errors without exposing internal messages and signals stale state', async () => {
    const conflict = voucherAdminError(
      { error: { code: 'INVALID_STATE_TRANSITION', message: 'private state machine detail' } },
      'fallback',
    );
    expect(conflict.message).toContain('Hãy tải lại');
    expect(conflict.message).not.toContain('private');
    expect(conflict.requiresRefetch).toBe(true);
    expect(voucherErrorRequiresRefetch(conflict)).toBe(true);

    const client = mockClient({
      POST: vi.fn().mockResolvedValue({
        error: { error: { code: 'DUPLICATE_RESOURCE', message: 'database index detail' } },
      }),
    });
    await expect(createVoucher(client, CREATE_INPUT)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
      message: 'Mã ưu đãi này đã tồn tại. Hãy chọn một mã khác.',
      requiresRefetch: false,
    });
  });
});

function mockClient(methods: Record<string, unknown>): VoucherApiClient {
  return methods as unknown as VoucherApiClient;
}
