import { describe, expect, it, vi } from 'vitest';
import {
  activateWarrantyPolicy,
  archiveWarrantyPolicy,
  clearWarrantyGuestCredential,
  createWarrantyPolicy,
  customerWarrantyError,
  getBackofficeWarranty,
  getWarrantyPolicy,
  getCustomerWarranty,
  listBackofficeWarranties,
  listCustomerWarranties,
  listWarrantyPolicies,
  resolveWarrantyGuestCredential,
  updateWarrantyPolicy,
  voidWarranty,
  warrantyAccessKey,
  type WarrantyCustomerError,
  warrantyError,
  type WarrantyApiClient,
} from './warranty-api';

const POLICY = {
  id: '0199b354-d818-7f7c-b966-3932599978cf',
  code: 'IPHONE-90',
  name: 'iPhone 90 ngày',
  defaultDays: 90,
  terms: 'Bảo hành phần cứng theo điều khoản.',
  status: 'INACTIVE' as const,
  isArchived: false,
  archivedAt: null,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

const CUSTOMER_WARRANTY = {
  warrantyCode: 'RPH-W-20260825-23456789',
  orderNumber: 'RPH-20260825-ABC23456',
  orderItemId: '0199b354-d818-7f7c-b966-3932599978d0',
  productName: 'iPhone 15',
  variantName: '128GB · Đen',
  inventoryCode: 'IP-TEST-001',
  daysSnapshot: 90,
  status: 'ACTIVE' as const,
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-10-30T00:00:00.000Z',
  isValid: true,
  isExpired: false,
};

describe('warranty typed-client adapter', () => {
  it('loads the owned page and understands the runtime pagination envelope', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [CUSTOMER_WARRANTY],
        meta: { pagination: { page: 2, pageSize: 12, totalItems: 14, totalPages: 2 } },
      },
    });
    const result = await listCustomerWarranties(mockClient({ GET: get }), {
      page: 2,
      pageSize: 12,
    });

    expect(get).toHaveBeenCalledWith('/api/v1/warranties', {
      params: { query: { page: 2, pageSize: 12 } },
    });
    expect(result).toMatchObject({
      data: [{ warrantyCode: CUSTOMER_WARRANTY.warrantyCode }],
      pagination: { page: 2, totalItems: 14 },
    });
  });

  it('passes a guest credential only through the generated header parameter', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: { ...CUSTOMER_WARRANTY, sku: 'IP15-128-BLK', termsSnapshot: 'Terms' } },
    });
    await getCustomerWarranty(mockClient({ GET: get }), CUSTOMER_WARRANTY.warrantyCode, 'token');

    expect(get).toHaveBeenCalledWith('/api/v1/warranties/{warrantyCode}', {
      params: {
        path: { warrantyCode: CUSTOMER_WARRANTY.warrantyCode },
        header: { 'X-Guest-Order-Token': 'token' },
      },
    });
  });

  it('allows a cookie-authorized guest detail request when no session credential exists', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: { ...CUSTOMER_WARRANTY, sku: 'IP15-128-BLK', termsSnapshot: 'Terms' } },
    });

    await getCustomerWarranty(mockClient({ GET: get }), CUSTOMER_WARRANTY.warrantyCode);

    expect(get).toHaveBeenCalledWith('/api/v1/warranties/{warrantyCode}', {
      params: {
        path: { warrantyCode: CUSTOMER_WARRANTY.warrantyCode },
        header: {},
      },
    });
  });

  it('never resolves a stored guest credential for an authenticated bearer session', () => {
    const token = 'A'.repeat(43);
    const storage = {
      getItem: vi.fn(() => token),
    };

    expect(
      resolveWarrantyGuestCredential('anonymous', CUSTOMER_WARRANTY.orderNumber, storage),
    ).toBe(token);
    expect(
      resolveWarrantyGuestCredential('authenticated', CUSTOMER_WARRANTY.orderNumber, storage),
    ).toBeUndefined();
    expect(resolveWarrantyGuestCredential('anonymous', 'invalid-order', storage)).toBeUndefined();

    const blockedStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(
      resolveWarrantyGuestCredential('anonymous', CUSTOMER_WARRANTY.orderNumber, blockedStorage),
    ).toBeUndefined();
  });

  it('keys warranty access by account identity and removes only the owning guest token', () => {
    expect(
      warrantyAccessKey(
        'authenticated',
        'customer-a',
        CUSTOMER_WARRANTY.orderNumber,
        CUSTOMER_WARRANTY.warrantyCode,
      ),
    ).not.toBe(
      warrantyAccessKey(
        'authenticated',
        'customer-b',
        CUSTOMER_WARRANTY.orderNumber,
        CUSTOMER_WARRANTY.warrantyCode,
      ),
    );

    const removeItem = vi.fn();
    clearWarrantyGuestCredential(CUSTOMER_WARRANTY.orderNumber.toLowerCase(), { removeItem });
    clearWarrantyGuestCredential('invalid-order', { removeItem });
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(`rephone_order_token:${CUSTOMER_WARRANTY.orderNumber}`);

    expect(() => {
      clearWarrantyGuestCredential(CUSTOMER_WARRANTY.orderNumber, {
        removeItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    }).not.toThrow();
  });

  it('classifies missing or non-owned customer warranty as one safe not-found state', async () => {
    const client = mockClient({
      GET: vi.fn().mockResolvedValue({
        error: { error: { code: 'ORDER_NOT_FOUND', message: 'private ownership detail' } },
      }),
    });

    await expect(
      getCustomerWarranty(client, CUSTOMER_WARRANTY.warrantyCode, 'token'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WarrantyCustomerError>>({
        kind: 'not-found',
        message: 'Không tìm thấy thông tin hoặc bạn không có quyền truy cập.',
      }),
    );
  });

  it('normalizes policy filters and keeps code out of the update body', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: [POLICY], meta: { pagination: { page: 1, pageSize: 20 } } },
    });
    const post = vi.fn().mockResolvedValue({ data: { data: POLICY } });
    const patch = vi.fn().mockResolvedValue({ data: { data: POLICY } });
    const client = mockClient({ GET: get, POST: post, PATCH: patch });

    await listWarrantyPolicies(client, {
      page: 1,
      pageSize: 20,
      q: 'IPHONE',
      status: '',
      archived: 'false',
    });
    await createWarrantyPolicy(client, {
      code: POLICY.code,
      name: POLICY.name,
      defaultDays: POLICY.defaultDays,
      terms: POLICY.terms,
    });
    await updateWarrantyPolicy(client, POLICY.id, {
      name: 'Tên mới',
      defaultDays: 180,
      terms: 'Điều khoản mới',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/warranty-policies', {
      params: { query: { page: 1, pageSize: 20, q: 'IPHONE', archived: false } },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/warranty-policies/{id}', {
      params: { path: { id: POLICY.id } },
      body: { name: 'Tên mới', defaultDays: 180, terms: 'Điều khoản mới' },
    });
  });

  it('keeps policy actions and archive readiness from the detail contract', async () => {
    const detail = {
      ...POLICY,
      archiveBlockedReason: 'ACTIVE_CATALOG_REFERENCES' as const,
      availableActions: ['EDIT', 'ACTIVATE'] as const,
    };
    const get = vi.fn().mockResolvedValue({ data: { data: detail } });

    const result = await getWarrantyPolicy(mockClient({ GET: get }), POLICY.id);

    expect(result.availableActions).toEqual(['EDIT', 'ACTIVATE']);
    expect(result.archiveBlockedReason).toBe('ACTIVE_CATALOG_REFERENCES');
    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/warranty-policies/{id}', {
      params: { path: { id: POLICY.id } },
    });
  });

  it('keeps policy actions fail-closed when the runtime payload is missing or unknown', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            ...POLICY,
            archiveBlockedReason: null,
            availableActions: ['EDIT', 'UNSUPPORTED', 42],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: { ...POLICY, archiveBlockedReason: null } },
      });
    const client = mockClient({ GET: get });

    await expect(getWarrantyPolicy(client, POLICY.id)).resolves.toMatchObject({
      availableActions: ['EDIT'],
    });
    await expect(getWarrantyPolicy(client, POLICY.id)).resolves.toMatchObject({
      availableActions: [],
    });
  });

  it('uses the exact lifecycle command routes and reason bodies', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: POLICY } });
    const client = mockClient({ POST: post });

    await activateWarrantyPolicy(client, POLICY.id);
    await archiveWarrantyPolicy(client, POLICY.id, 'Không còn cung cấp chính sách này');

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/warranty-policies/{id}/activate',
        { params: { path: { id: POLICY.id } } },
      ],
      [
        '/api/v1/backoffice/warranty-policies/{id}/archive',
        {
          params: { path: { id: POLICY.id } },
          body: { reason: 'Không còn cung cấp chính sách này' },
        },
      ],
    ]);
  });

  it('loads and voids backoffice warranty without exposing untyped fields', async () => {
    const row = {
      ...CUSTOMER_WARRANTY,
      id: POLICY.id,
      customer: {
        customerId: null,
        name: 'Guest',
        email: 'guest@example.com',
        phone: '0900000000',
      },
      policy: null,
      createdAt: CUSTOMER_WARRANTY.startAt,
    };
    const detail = {
      ...row,
      availableActions: ['VOID'] as const,
      sku: 'IP15-128-BLK',
      termsSnapshot: 'Terms',
      updatedAt: CUSTOMER_WARRANTY.startAt,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
    };
    const get = vi.fn().mockResolvedValue({
      data: { data: [row], meta: { pagination: { page: 1, pageSize: 20 } } },
    });
    const post = vi.fn().mockResolvedValue({ data: { data: detail } });
    const client = mockClient({ GET: get, POST: post });

    const page = await listBackofficeWarranties(client, {
      page: 1,
      pageSize: 20,
      status: 'ACTIVE',
      validity: '',
    });
    const voided = await voidWarranty(client, POLICY.id, 'Hoàn tiền theo case hậu mãi');

    expect(page.data[0]).not.toHaveProperty('rawIdentifier');
    expect(voided.warrantyCode).toBe(CUSTOMER_WARRANTY.warrantyCode);
    expect(post).toHaveBeenCalledWith('/api/v1/backoffice/warranties/{id}/void', {
      params: { path: { id: POLICY.id } },
      body: { reason: 'Hoàn tiền theo case hậu mãi' },
    });
  });

  it('validates required warranty detail fields and defaults malformed actions to none', async () => {
    const safeDetail = backofficeWarrantyDetail();
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: safeDetail } })
      .mockResolvedValueOnce({ data: { data: { ...safeDetail, customer: null } } });
    const client = mockClient({ GET: get });

    await expect(getBackofficeWarranty(client, POLICY.id)).resolves.toMatchObject({
      availableActions: [],
      warrantyCode: CUSTOMER_WARRANTY.warrantyCode,
    });
    await expect(getBackofficeWarranty(client, POLICY.id)).rejects.toThrow(
      'Dữ liệu khách hàng trong bảo hành không hợp lệ.',
    );
  });

  it('maps stable conflicts without reflecting unsafe server detail', () => {
    expect(
      warrantyError(
        { error: { code: 'INVALID_STATE_TRANSITION', message: 'private row detail' } },
        'fallback',
      ),
    ).toContain('Hãy tải lại');
    expect(
      warrantyError(
        { error: { code: 'CONCURRENT_MODIFICATION', message: 'private row detail' } },
        'fallback',
      ),
    ).toBe('Dữ liệu vừa được cập nhật. Hãy tải lại trang.');
    expect(
      customerWarrantyError(
        { error: { code: 'INTERNAL_ERROR', message: 'private server detail' } },
        'fallback',
      ),
    ).toBe('Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.');
    expect(
      warrantyError(
        { error: { code: 'BACKOFFICE_DIAGNOSTIC', message: 'Chi tiết phục vụ vận hành.' } },
        'fallback',
      ),
    ).toBe('Chi tiết phục vụ vận hành.');
  });
});

function mockClient(methods: Record<string, unknown>): WarrantyApiClient {
  return methods as unknown as WarrantyApiClient;
}

function backofficeWarrantyDetail() {
  return {
    ...CUSTOMER_WARRANTY,
    id: POLICY.id,
    customer: {
      customerId: null,
      name: 'Guest',
      email: 'guest@example.com',
      phone: '0900000000',
    },
    policy: null,
    createdAt: CUSTOMER_WARRANTY.startAt,
    sku: 'IP15-128-BLK',
    termsSnapshot: 'Terms',
    updatedAt: CUSTOMER_WARRANTY.startAt,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
  };
}
