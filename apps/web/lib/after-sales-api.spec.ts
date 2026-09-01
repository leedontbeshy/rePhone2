import { describe, expect, it, vi } from 'vitest';
import {
  afterSalesError,
  cancelAfterSalesRequest,
  createAfterSalesRequest,
  getAfterSalesAttachmentUrl,
  getAfterSalesRequest,
  getAfterSalesOrderItem,
  getCompletedAfterSalesOrder,
  listCustomerAfterSalesRequests,
  listCompletedAfterSalesOrders,
  resolveGuestOrderToken,
  uploadAfterSalesAttachment,
  validateAfterSalesAttachment,
  type AfterSalesApiClient,
  type AfterSalesCustomerError,
} from './after-sales-api';
import { orderTokenStorageKey } from './order-access';

const REQUEST_NUMBER = 'RPH-AS-20260825-23456789';
const ORDER_NUMBER = 'RPH-20260825-ABC23456';
const TOKEN = 'A'.repeat(43);
const ITEM_ID = '0199b354-d818-7f7c-b966-3932599978d0';
const DETAIL = {
  requestNumber: REQUEST_NUMBER,
  type: 'WARRANTY' as const,
  status: 'REQUESTED' as const,
  issueDescription: 'Màn hình xuất hiện sọc xanh khi sử dụng.',
  requestedResolution: 'Kiểm tra và sửa chữa.',
  requestedAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  orderItem: {
    id: ITEM_ID,
    orderNumber: ORDER_NUMBER,
    productName: 'iPhone 15',
    variantName: '128GB · Đen',
    inventoryCode: 'IP-TEST-001',
    quantity: 1,
  },
  warranty: null,
  attachments: [],
  timeline: { requestedAt: '2026-08-25T00:00:00.000Z' },
  availableActions: ['UPLOAD_ATTACHMENT', 'CANCEL'] as const,
};

describe('after-sales typed-client adapter', () => {
  it('normalizes customer filters and pagination', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [DETAIL],
        meta: { pagination: { page: 2, pageSize: 10, totalItems: 11, totalPages: 2 } },
      },
    });
    const result = await listCustomerAfterSalesRequests(mockClient({ GET: get }), {
      type: 'WARRANTY',
      status: '',
      page: 2,
      pageSize: 10,
    });

    expect(get).toHaveBeenCalledWith('/api/v1/after-sales', {
      params: { query: { page: 2, pageSize: 10, type: 'WARRANTY' } },
    });
    expect(result.pagination).toMatchObject({ page: 2, totalItems: 11 });
  });

  it('keeps the guest credential in headers for create, detail and cancel', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: DETAIL } });
    const post = vi.fn().mockResolvedValue({ data: { data: DETAIL } });
    const client = mockClient({ GET: get, POST: post });

    await createAfterSalesRequest(
      client,
      {
        orderItemId: ITEM_ID,
        type: 'WARRANTY',
        issueDescription: DETAIL.issueDescription,
      },
      TOKEN,
    );
    await getAfterSalesRequest(client, REQUEST_NUMBER, TOKEN);
    await cancelAfterSalesRequest(client, REQUEST_NUMBER, 'Tôi đã thay đổi nhu cầu', TOKEN);

    expect(post.mock.calls[0]).toEqual([
      '/api/v1/after-sales',
      {
        params: {
          header: { 'X-Rephone-CSRF': '1', 'X-Guest-Order-Token': TOKEN },
        },
        body: {
          orderItemId: ITEM_ID,
          type: 'WARRANTY',
          issueDescription: DETAIL.issueDescription,
        },
      },
    ]);
    expect(JSON.stringify(post.mock.calls)).not.toContain('token=');
    expect(get).toHaveBeenCalledWith('/api/v1/after-sales/{requestNumber}', {
      params: {
        path: { requestNumber: REQUEST_NUMBER },
        header: { 'X-Guest-Order-Token': TOKEN },
      },
    });
  });

  it('does not add a guest credential when bearer identity is authoritative', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: DETAIL } });
    const post = vi.fn().mockResolvedValue({ data: { data: DETAIL } });
    const client = mockClient({ GET: get, POST: post });

    await getAfterSalesRequest(client, REQUEST_NUMBER);
    await createAfterSalesRequest(client, {
      orderItemId: ITEM_ID,
      type: 'RETURN',
      issueDescription: DETAIL.issueDescription,
    });

    expect(get).toHaveBeenCalledWith('/api/v1/after-sales/{requestNumber}', {
      params: { path: { requestNumber: REQUEST_NUMBER }, header: {} },
    });
    expect(post).toHaveBeenCalledWith('/api/v1/after-sales', {
      params: { header: { 'X-Rephone-CSRF': '1' } },
      body: {
        orderItemId: ITEM_ID,
        type: 'RETURN',
        issueDescription: DETAIL.issueDescription,
      },
    });
  });

  it('resolves only a valid order-scoped session token', () => {
    const values = new Map<string, string>([[orderTokenStorageKey(ORDER_NUMBER), TOKEN]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(resolveGuestOrderToken(ORDER_NUMBER.toLowerCase(), storage)).toBe(TOKEN);
    expect(resolveGuestOrderToken('RPH-INVALID', storage)).toBeUndefined();
    values.set(orderTokenStorageKey(ORDER_NUMBER), 'short');
    expect(resolveGuestOrderToken(ORDER_NUMBER, storage)).toBeUndefined();
  });

  it('accepts HTTPS signed URLs and rejects credential-bearing URLs', async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    const safeGet = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'https://storage.example.test/signed/object?signature=opaque',
          expiresAt: futureExpiry,
        },
      },
    });
    await expect(
      getAfterSalesAttachmentUrl(mockClient({ GET: safeGet }), REQUEST_NUMBER, ITEM_ID, TOKEN),
    ).resolves.toMatchObject({ expiresAt: futureExpiry });

    const unsafeGet = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'https://user:secret@storage.example.test/object',
          expiresAt: futureExpiry,
        },
      },
    });
    await expect(
      getAfterSalesAttachmentUrl(mockClient({ GET: unsafeGet }), REQUEST_NUMBER, ITEM_ID),
    ).rejects.toThrow('Không thể mở liên kết tệp đính kèm.');

    const expiredGet = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'https://storage.example.test/signed/object?signature=expired',
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
      },
    });
    await expect(
      getAfterSalesAttachmentUrl(mockClient({ GET: expiredGet }), REQUEST_NUMBER, ITEM_ID),
    ).rejects.toThrow('Liên kết tệp vừa hết hạn');
  });

  it('uploads one multipart file while keeping the guest credential in headers', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { data: { requestNumber: REQUEST_NUMBER, attachments: [] } },
    });
    const file = new File(['safe-bytes'], 'damage.webp', { type: 'image/webp' });

    await uploadAfterSalesAttachment(mockClient({ POST: post }), REQUEST_NUMBER, file, TOKEN);

    const [path, options] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/after-sales/{requestNumber}/attachments');
    expect(options['params']).toEqual({
      path: { requestNumber: REQUEST_NUMBER },
      header: { 'X-Rephone-CSRF': '1', 'X-Guest-Order-Token': TOKEN },
    });
    const bodySerializer = options['bodySerializer'] as () => FormData;
    expect(bodySerializer().get('file')).toBe(file);
    expect(JSON.stringify(options['body'])).not.toContain(TOKEN);
    expect(validateAfterSalesAttachment(file)).toBeNull();
    expect(
      validateAfterSalesAttachment({
        size: 10 * 1024 * 1024 + 1,
        type: 'image/webp',
      } as File),
    ).toBe('Tệp vượt quá giới hạn 10 MB.');
  });

  it('maps lifecycle errors without reflecting private server detail', () => {
    expect(
      afterSalesError(
        { error: { code: 'AFTER_SALES_REQUEST_ALREADY_OPEN', message: 'private row detail' } },
        'fallback',
      ),
    ).toContain('đang mở');
    expect(
      afterSalesError(
        { error: { code: 'CSRF_VALIDATION_FAILED', message: 'private token detail' } },
        'fallback',
      ),
    ).toBe('Không thể xác minh thao tác này. Hãy mở lại đơn hàng rồi thử lại.');
    expect(
      afterSalesError(
        { error: { code: 'STORAGE_UNAVAILABLE', message: 'private storage detail' } },
        'fallback',
      ),
    ).toBe('Hiện chưa thể lưu tệp. Vui lòng thử lại sau.');
    expect(afterSalesError({ error: { code: 'WARRANTY_NOT_ACTIVE' } }, 'fallback')).toBe(
      'Bảo hành hiện chưa đủ điều kiện để gửi yêu cầu.',
    );
    expect(afterSalesError({ error: { code: 'ATTACHMENT_LIMIT_REACHED' } }, 'fallback')).toBe(
      'Yêu cầu này đã có đủ 5 tệp đính kèm.',
    );
  });

  it('classifies hidden resources and concurrent changes for customer flows', async () => {
    const missing = mockClient({
      GET: vi.fn().mockResolvedValue({ error: { error: { code: 'RESOURCE_NOT_FOUND' } } }),
    });
    await expect(getAfterSalesRequest(missing, REQUEST_NUMBER, TOKEN)).rejects.toMatchObject({
      name: 'AfterSalesCustomerError',
      code: 'RESOURCE_NOT_FOUND',
      notFound: true,
      conflict: false,
    });

    const conflict = mockClient({
      POST: vi.fn().mockResolvedValue({ error: { error: { code: 'CONCURRENT_MODIFICATION' } } }),
    });
    await expect(
      cancelAfterSalesRequest(conflict, REQUEST_NUMBER, 'Không còn nhu cầu', TOKEN),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AfterSalesCustomerError>>({ conflict: true }),
    );
  });

  it('returns only the selected order item and hides a missing item as not found', async () => {
    const client = mockClient({
      GET: vi.fn().mockResolvedValue({
        data: {
          data: {
            status: 'COMPLETED',
            completedAt: '2026-08-28T00:00:00.000Z',
            items: [{ ...DETAIL.orderItem, id: ITEM_ID }],
          },
        },
      }),
    });
    await expect(
      getAfterSalesOrderItem(client, ORDER_NUMBER, ITEM_ID, TOKEN),
    ).resolves.toMatchObject({ id: ITEM_ID });
    await expect(
      getAfterSalesOrderItem(client, ORDER_NUMBER, 'missing', TOKEN),
    ).rejects.toMatchObject({ notFound: true });
  });

  it('uses authoritative completed status for selectable orders and direct item access', async () => {
    const completedOrder = {
      status: 'COMPLETED',
      completedAt: '2026-08-28T00:00:00.000Z',
      orderNumber: ORDER_NUMBER,
      items: [{ ...DETAIL.orderItem, id: ITEM_ID }],
    };
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: [
            { orderNumber: ORDER_NUMBER, status: 'COMPLETED' },
            { orderNumber: 'RPH-20260825-BAD23456', status: 'PROCESSING' },
          ],
          meta: { pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } },
        },
      })
      .mockResolvedValueOnce({ data: { data: completedOrder } })
      .mockResolvedValueOnce({ data: { data: { ...completedOrder, status: 'PROCESSING' } } });
    const client = mockClient({ GET: get });

    await expect(listCompletedAfterSalesOrders(client)).resolves.toMatchObject({
      data: [expect.objectContaining({ orderNumber: ORDER_NUMBER })],
      pagination: { page: 1, totalPages: 1 },
    });
    await expect(getCompletedAfterSalesOrder(client, ORDER_NUMBER)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    await expect(getAfterSalesOrderItem(client, ORDER_NUMBER, ITEM_ID)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      conflict: true,
    });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { query: { status: 'COMPLETED' } } });
  });

  it('loads only the requested completed-order page', async () => {
    const second = { orderNumber: 'RPH-20260826-DEF23456', status: 'COMPLETED' };
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [second],
        meta: { pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } },
      },
    });

    await expect(
      listCompletedAfterSalesOrders(mockClient({ GET: get }), { page: 2, pageSize: 20 }),
    ).resolves.toMatchObject({ data: [second], pagination: { page: 2, totalPages: 2 } });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/v1/orders', {
      params: {
        query: {
          status: 'COMPLETED',
          page: 2,
          pageSize: 20,
          sortBy: 'placedAt',
          sortOrder: 'desc',
        },
      },
    });
  });
});

function mockClient(methods: Record<string, unknown>): AfterSalesApiClient {
  return methods as unknown as AfterSalesApiClient;
}
