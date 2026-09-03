import { describe, expect, it, vi } from 'vitest';
import {
  activateCatalogVariant,
  archiveCatalogProduct,
  archiveCatalogVariant,
  catalogError,
  createCatalogProduct,
  createCatalogVariant,
  deleteCatalogProductMedia,
  deleteCatalogVariantMedia,
  getCatalogProduct,
  listCatalogProducts,
  listCatalogWarrantyOptions,
  publishCatalogProduct,
  updateCatalogProduct,
  updateCatalogProductMedia,
  updateCatalogVariant,
  updateCatalogVariantMedia,
  uploadCatalogProductMedia,
  uploadCatalogVariantMedia,
  validateCatalogMediaFile,
  type BackofficeCatalogError,
  type CatalogApiClient,
} from './backoffice-catalog-api';

const PRODUCT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe0';
const VARIANT_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe1';
const MEDIA_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe2';
const POLICY_ID = '0199c346-f8d2-79d8-b90b-e462bd717fe3';

const MEDIA_SUMMARY = {
  id: MEDIA_ID,
  url: 'https://cdn.example.com/iphone-15.webp',
  altText: 'iPhone 15 màu đen',
  sortOrder: 0,
};

const VARIANT = {
  id: VARIANT_ID,
  productId: PRODUCT_ID,
  sku: 'IP15-128-BLK',
  displayName: '128 GB · Đen',
  storageCapacityGb: 128,
  colorName: 'Đen',
  colorHex: '#111111',
  inventoryMode: 'SERIALIZED' as const,
  salePrice: null,
  compareAtPrice: null,
  accessoryAttributes: {
    chatLieu: 'Nhôm',
    tuongThich: ['iPhone 15', 'iPhone 15 Pro'],
    hiddenTechnicalObject: { key: 'value' },
  },
  warrantyPolicyId: POLICY_ID,
  status: 'DRAFT' as const,
  media: [MEDIA_SUMMARY],
  createdAt: '2026-08-28T01:00:00.000Z',
  updatedAt: '2026-08-28T02:00:00.000Z',
};

const PRODUCT = {
  id: PRODUCT_ID,
  type: 'IPHONE' as const,
  brand: 'Apple',
  name: 'iPhone 15',
  slug: 'iphone-15',
  status: 'DRAFT' as const,
  releaseYear: 2023,
  variantCount: 1,
  primaryMedia: MEDIA_SUMMARY,
  createdAt: '2026-08-28T01:00:00.000Z',
  updatedAt: '2026-08-28T02:00:00.000Z',
  description: 'Thiết kế bền bỉ và dễ sử dụng.',
  chipset: 'Apple A16 Bionic',
  ramGb: 6,
  screenSizeInches: '6.1',
  warrantyPolicyId: POLICY_ID,
  seoTitle: 'iPhone 15 cũ',
  seoDescription: 'Khám phá các máy iPhone 15 đang có sẵn.',
  archivedAt: null,
  variants: [VARIANT],
  media: [MEDIA_SUMMARY],
};

const UPLOADED_MEDIA = {
  ...MEDIA_SUMMARY,
  fileSize: 4,
  height: 800,
  width: 800,
  mimeType: 'image/webp' as const,
  ownerId: PRODUCT_ID,
  ownerType: 'PRODUCT' as const,
  createdAt: '2026-08-28T02:00:00.000Z',
};

describe('backoffice catalog adapter', () => {
  it('normalizes list filters and exposes Vietnamese labels instead of API enums', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [PRODUCT],
        meta: { pagination: { page: 2, pageSize: 12, totalItems: 13, totalPages: 2 } },
      },
    });

    const result = await listCatalogProducts(mockClient({ GET: get }), {
      search: '  iPhone  ',
      type: 'iphone',
      status: 'active',
      releaseYear: 2023,
      page: 2,
      pageSize: 12,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/products', {
      params: {
        query: {
          q: 'iPhone',
          type: 'IPHONE',
          status: 'ACTIVE',
          releaseYear: 2023,
          page: 2,
          pageSize: 12,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      },
    });
    expect(result).toMatchObject({
      data: [
        {
          id: PRODUCT_ID,
          type: 'iphone',
          typeLabel: 'iPhone',
          status: 'draft',
          statusLabel: 'Bản nháp',
          primaryMedia: { url: MEDIA_SUMMARY.url },
        },
      ],
      pagination: { page: 2, totalItems: 13, totalPages: 2 },
    });
  });

  it('forwards a cancellation signal for live search requests', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [],
        meta: { pagination: { page: 1, pageSize: 6, totalItems: 0, totalPages: 0 } },
      },
    });
    const controller = new AbortController();

    await listCatalogProducts(
      mockClient({ GET: get }),
      {
        search: 'iPhone 17',
        page: 1,
        pageSize: 6,
        sortBy: 'releaseYear',
        sortOrder: 'desc',
      },
      { signal: controller.signal },
    );

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/products', {
      params: {
        query: {
          q: 'iPhone 17',
          page: 1,
          pageSize: 6,
          sortBy: 'releaseYear',
          sortOrder: 'desc',
        },
      },
      signal: controller.signal,
    });
  });

  it('loads a detail while converting variant attributes into friendly fields', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: PRODUCT } });
    const patch = vi.fn().mockResolvedValue({ data: { data: VARIANT } });

    const client = mockClient({ GET: get, PATCH: patch });
    const result = await getCatalogProduct(client, PRODUCT_ID);

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/products/{id}', {
      params: { path: { id: PRODUCT_ID } },
    });
    expect(result.variants[0]).toMatchObject({
      inventoryMode: 'serialized',
      inventoryModeLabel: 'Theo từng máy',
      attributes: [
        { name: 'chatLieu', value: 'Nhôm' },
        { name: 'tuongThich', value: 'iPhone 15, iPhone 15 Pro' },
        { hidden: true, name: 'hiddenTechnicalObject', value: '' },
      ],
    });
    expect(result.variants[0]).not.toHaveProperty('accessoryAttributes');
    await updateCatalogVariant(client, VARIANT_ID, {
      attributes: result.variants[0]?.attributes ?? [],
      displayName: 'Không đổi thông số',
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/variants/{id}', {
      params: { path: { id: VARIANT_ID } },
      body: {
        accessoryAttributes: VARIANT.accessoryAttributes,
        displayName: 'Không đổi thông số',
      },
    });
  });

  it('uses the generated create, update, publish, and archive contracts', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: PRODUCT } });
    const patch = vi.fn().mockResolvedValue({ data: { data: PRODUCT } });
    const client = mockClient({ POST: post, PATCH: patch });

    await createCatalogProduct(client, {
      type: 'iphone',
      name: PRODUCT.name,
      slug: PRODUCT.slug,
      releaseYear: 2023,
    });
    await updateCatalogProduct(client, PRODUCT_ID, {
      type: 'accessory',
      brand: 'Apple',
      name: 'Ốp lưng MagSafe',
    });
    await publishCatalogProduct(client, PRODUCT_ID);
    await archiveCatalogProduct(client, PRODUCT_ID, 'Không còn kinh doanh sản phẩm này');

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/products',
        {
          body: {
            type: 'IPHONE',
            brand: 'Apple',
            name: PRODUCT.name,
            slug: PRODUCT.slug,
            releaseYear: 2023,
          },
        },
      ],
      ['/api/v1/backoffice/products/{id}/publish', { params: { path: { id: PRODUCT_ID } } }],
      [
        '/api/v1/backoffice/products/{id}/archive',
        {
          params: { path: { id: PRODUCT_ID } },
          body: { reason: 'Không còn kinh doanh sản phẩm này' },
        },
      ],
    ]);
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/products/{id}', {
      params: { path: { id: PRODUCT_ID } },
      body: { type: 'ACCESSORY', brand: 'Apple', name: 'Ốp lưng MagSafe' },
    });
  });

  it('maps typed variant fields and sends attribute rows without a JSON editor', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: VARIANT } });
    const patch = vi.fn().mockResolvedValue({ data: { data: VARIANT } });
    const client = mockClient({ POST: post, PATCH: patch });

    await createCatalogVariant(client, PRODUCT_ID, {
      sku: 'CASE-CLR',
      displayName: 'Trong suốt',
      salePrice: '590000',
      attributes: [
        { name: ' chất liệu ', value: ' Nhựa trong ' },
        { name: '', value: 'không gửi' },
      ],
    });
    await updateCatalogVariant(client, VARIANT_ID, {
      displayName: 'Trong suốt MagSafe',
      attributes: [{ name: 'tương thích', value: 'iPhone 15' }],
      warrantyPolicyId: null,
    });
    await activateCatalogVariant(client, VARIANT_ID);
    await archiveCatalogVariant(client, VARIANT_ID, 'Không còn nhập phiên bản này');

    expect(post.mock.calls).toEqual([
      [
        '/api/v1/backoffice/products/{productId}/variants',
        {
          params: { path: { productId: PRODUCT_ID } },
          body: {
            sku: 'CASE-CLR',
            displayName: 'Trong suốt',
            salePrice: '590000',
            accessoryAttributes: { 'chất liệu': 'Nhựa trong' },
          },
        },
      ],
      ['/api/v1/backoffice/variants/{id}/activate', { params: { path: { id: VARIANT_ID } } }],
      [
        '/api/v1/backoffice/variants/{id}/archive',
        {
          params: { path: { id: VARIANT_ID } },
          body: { reason: 'Không còn nhập phiên bản này' },
        },
      ],
    ]);
    expect(patch).toHaveBeenCalledWith('/api/v1/backoffice/variants/{id}', {
      params: { path: { id: VARIANT_ID } },
      body: {
        displayName: 'Trong suốt MagSafe',
        accessoryAttributes: { 'tương thích': 'iPhone 15' },
        warrantyPolicyId: null,
      },
    });
  });

  it('uploads product and variant images through real multipart bodies', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: UPLOADED_MEDIA } });
    const client = mockClient({ POST: post });
    const image = new Blob(['data'], { type: 'image/webp' });

    expect(validateCatalogMediaFile(image)).toBeNull();
    expect(validateCatalogMediaFile(new Blob([], { type: 'image/webp' }))).toContain('trống');
    expect(validateCatalogMediaFile(new Blob(['data'], { type: 'text/plain' }))).toContain('JPEG');

    await uploadCatalogProductMedia(client, PRODUCT_ID, {
      file: image,
      altText: '  iPhone 15 màu đen  ',
      sortOrder: 2,
    });
    await uploadCatalogVariantMedia(client, VARIANT_ID, { file: image });

    expect(post.mock.calls[0]?.[0]).toBe('/api/v1/backoffice/products/{id}/media');
    expect(post.mock.calls[1]?.[0]).toBe('/api/v1/backoffice/variants/{id}/media');
    for (const [, options] of post.mock.calls) {
      const request = options as {
        body: { file: Blob };
        bodySerializer: () => FormData;
      };
      expect(request.body.file).toBe(image);
      expect(request.bodySerializer()).toBeInstanceOf(FormData);
      expect(request.bodySerializer().get('file')).toBeInstanceOf(Blob);
    }
    const firstOptions = post.mock.calls[0]?.[1] as { bodySerializer: () => FormData };
    expect(firstOptions.bodySerializer().get('altText')).toBe('iPhone 15 màu đen');
    expect(firstOptions.bodySerializer().get('sortOrder')).toBe('2');
  });

  it('updates and deletes both product and variant media through the shared media resource', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { data: UPLOADED_MEDIA } });
    const remove = vi.fn().mockResolvedValue({ response: { status: 204 } });
    const client = mockClient({ PATCH: patch, DELETE: remove });

    await updateCatalogProductMedia(client, MEDIA_ID, { altText: 'Ảnh chính', sortOrder: 0 });
    await updateCatalogVariantMedia(client, MEDIA_ID, { altText: 'Ảnh phiên bản' });
    await deleteCatalogProductMedia(client, MEDIA_ID);
    await deleteCatalogVariantMedia(client, MEDIA_ID);

    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenNthCalledWith(1, '/api/v1/backoffice/product-media/{id}', {
      params: { path: { id: MEDIA_ID } },
      body: { altText: 'Ảnh chính', sortOrder: 0 },
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('/api/v1/backoffice/product-media/{id}', {
      params: { path: { id: MEDIA_ID } },
    });
  });

  it('loads only active warranty policies as human-readable selector options', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: POLICY_ID,
            code: 'IPHONE-90',
            name: 'Bảo hành iPhone',
            defaultDays: 90,
            terms: 'Điều khoản',
            status: 'ACTIVE',
            isArchived: false,
            archivedAt: null,
            createdAt: PRODUCT.createdAt,
            updatedAt: PRODUCT.updatedAt,
          },
        ],
        meta: { pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } },
      },
    });

    const options = await listCatalogWarrantyOptions(mockClient({ GET: get }), '  iPhone ');

    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/warranty-policies', {
      params: {
        query: {
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          archived: false,
          q: 'iPhone',
        },
      },
    });
    expect(options).toEqual([
      {
        value: POLICY_ID,
        label: 'Bảo hành iPhone · 90 ngày',
        name: 'Bảo hành iPhone',
        code: 'IPHONE-90',
        defaultDays: 90,
      },
    ]);
  });

  it('forwards cancellation when loading warranty selector options', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: [],
        meta: { pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } },
      },
    });
    const controller = new AbortController();

    await listCatalogWarrantyOptions(mockClient({ GET: get }), undefined, {
      signal: controller.signal,
    });

    expect(get).toHaveBeenCalledWith(
      '/api/v1/backoffice/warranty-policies',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('returns natural messages and an explicit refetch signal for stale state', () => {
    expect(
      catalogError(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'ACTIVE_VARIANT_REQUIRED',
            details: [{ field: 'variants', code: 'ACTIVE_VARIANT_REQUIRED' }],
          },
        },
        'fallback',
      ),
    ).toMatchObject({
      message: 'Cần ít nhất một phiên bản đang bán trước khi đưa sản phẩm lên bán.',
      code: 'VALIDATION_FAILED',
      requiresRefetch: false,
    } satisfies Partial<BackofficeCatalogError>);

    expect(
      catalogError(
        {
          error: {
            code: 'VALIDATION_FAILED',
            details: [{ field: 'variant', code: 'LAST_ACTIVE_VARIANT_REQUIRED' }],
          },
        },
        'fallback',
      ),
    ).toMatchObject({
      message:
        'Sản phẩm đang bán cần ít nhất một phiên bản đang bán. Hãy mở bán phiên bản khác trước.',
      code: 'VALIDATION_FAILED',
    });

    expect(
      catalogError(
        { error: { code: 'INVALID_STATE_TRANSITION', message: 'private detail' } },
        'fallback',
      ),
    ).toMatchObject({
      message: 'Trạng thái dữ liệu vừa thay đổi. Hãy tải lại trang.',
      code: 'INVALID_STATE_TRANSITION',
      requiresRefetch: true,
    } satisfies Partial<BackofficeCatalogError>);
  });
});

function mockClient(overrides: Record<string, unknown>): CatalogApiClient {
  return {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
    ...overrides,
  } as unknown as CatalogApiClient;
}
