import { describe, expect, it, vi } from 'vitest';
import {
  afterSalesError,
  cancelAfterSalesRequest,
  createAfterSalesRequest,
  getAfterSalesAttachmentUrl,
  getAfterSalesRequest,
  listCustomerAfterSalesRequests,
  resolveGuestOrderToken,
  uploadAfterSalesAttachment,
  validateAfterSalesAttachment,
  type AfterSalesApiClient,
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

  it('resolves only a valid order-scoped session token', () => {
    const values = new Map<string, string>([[orderTokenStorageKey(ORDER_NUMBER), TOKEN]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(resolveGuestOrderToken(ORDER_NUMBER.toLowerCase(), storage)).toBe(TOKEN);
    expect(resolveGuestOrderToken('RPH-INVALID', storage)).toBeUndefined();
    values.set(orderTokenStorageKey(ORDER_NUMBER), 'short');
    expect(resolveGuestOrderToken(ORDER_NUMBER, storage)).toBeUndefined();
  });

  it('accepts HTTPS signed URLs and rejects credential-bearing URLs', async () => {
    const safeGet = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'https://storage.example.test/signed/object?signature=opaque',
          expiresAt: '2026-08-25T00:05:00.000Z',
        },
      },
    });
    await expect(
      getAfterSalesAttachmentUrl(mockClient({ GET: safeGet }), REQUEST_NUMBER, ITEM_ID, TOKEN),
    ).resolves.toMatchObject({ expiresAt: '2026-08-25T00:05:00.000Z' });

    const unsafeGet = vi.fn().mockResolvedValue({
      data: {
        data: {
          url: 'https://user:secret@storage.example.test/object',
          expiresAt: '2026-08-25T00:05:00.000Z',
        },
      },
    });
    await expect(
      getAfterSalesAttachmentUrl(mockClient({ GET: unsafeGet }), REQUEST_NUMBER, ITEM_ID),
    ).rejects.toThrow('signed URL');
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
  });

  it('maps lifecycle errors without reflecting private server detail', () => {
    expect(
      afterSalesError(
        { error: { code: 'AFTER_SALES_REQUEST_ALREADY_OPEN', message: 'private row detail' } },
        'fallback',
      ),
    ).toContain('đang mở');
  });
});

function mockClient(methods: Record<string, unknown>): AfterSalesApiClient {
  return methods as unknown as AfterSalesApiClient;
}
