import { describe, expect, it, vi } from 'vitest';
import { BackofficeCatalogService } from './backoffice-catalog.service.js';

const ACTOR = {
  actorUserId: '0198e6c6-5798-7cde-a964-8eb51811915f',
  requestId: 'request-backoffice-catalog',
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
};

describe('BackofficeCatalogService', () => {
  it('lists products with stable pagination and maps complete product details safely', async () => {
    const fixture = createFixture();
    fixture.repository.listProducts.mockResolvedValue({
      items: [product({ variants: undefined, media: undefined })],
      totalItems: 21,
    });
    fixture.repository.findProduct.mockResolvedValue(
      product({
        screenSizeInches: '6.7',
        variants: [variant({ salePrice: null, compareAtPrice: null })],
        media: [
          {
            id: 'media-1',
            bucket: 'public catalog',
            objectPath: 'products/product 1/front image.webp',
            altText: 'Front',
            sortOrder: 0,
          },
        ],
      }),
    );

    const list = await fixture.service.listProducts({ page: 2, pageSize: 20 } as never);
    const detail = await fixture.service.getProduct('product-1');

    expect(list).toMatchObject({
      items: [{ id: 'product-1', variantCount: 1 }],
      pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    });
    expect(detail).toMatchObject({
      screenSizeInches: '6.7',
      variants: [{ salePrice: null, compareAtPrice: null }],
      media: [
        {
          url: 'https://storage.test/storage/v1/object/public/public%20catalog/products/product%201/front%20image.webp',
        },
      ],
    });
  });

  it('returns not found for a missing product detail', async () => {
    const fixture = createFixture();
    fixture.repository.findProduct.mockResolvedValue(null);

    await expect(fixture.service.getProduct('missing')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('creates an iPhone product and audits only its safe catalog snapshot', async () => {
    const fixture = createFixture();
    fixture.repository.createProduct.mockResolvedValue(product());

    const result = await fixture.service.createProduct(createProduct(), ACTOR);

    expect(result).toMatchObject({ id: 'product-1', type: 'IPHONE', status: 'DRAFT' });
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      ACTOR,
      expect.objectContaining({
        action: 'catalog.product.created',
        changes: { after: { type: 'IPHONE', slug: 'iphone-17', status: 'DRAFT' } },
      }),
    );
  });

  it.each(['releaseYear', 'chipset', 'ramGb', 'screenSizeInches'])(
    'forbids %s on an accessory product',
    async (field) => {
      const fixture = createFixture();
      await expect(
        fixture.service.createProduct(
          createProduct({
            type: 'ACCESSORY',
            [field]: field === 'ramGb' ? 8 : 'phone-spec',
          }) as never,
          ACTOR,
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'type', code: 'ACCESSORY_PHONE_SPECS_FORBIDDEN' }],
      });
      expect(fixture.transactions.run).not.toHaveBeenCalled();
    },
  );

  it('maps only unique create failures and preserves unrelated errors', async () => {
    const unique = createFixture();
    unique.repository.createProduct.mockRejectedValue({ code: 'P2002' });
    await expect(unique.service.createProduct(createProduct(), ACTOR)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    });

    const failure = new Error('repository failed');
    const generic = createFixture();
    generic.repository.createProduct.mockRejectedValue(failure);
    await expect(generic.service.createProduct(createProduct(), ACTOR)).rejects.toBe(failure);
  });

  it('rejects missing, archived and immutable product updates', async () => {
    const missing = createFixture();
    missing.repository.findProduct.mockResolvedValue(null);
    await expect(
      missing.service.updateProduct('missing', { name: 'New' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const archived = createFixture();
    archived.repository.findProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(
      archived.service.updateProduct('product-1', { name: 'New' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const immutable = createFixture();
    immutable.repository.findProduct.mockResolvedValue(product());
    await expect(
      immutable.service.updateProduct('product-1', { type: 'ACCESSORY' }, ACTOR),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'type', code: 'PRODUCT_TYPE_IMMUTABLE' }],
    });
  });

  it('updates every product field and clears phone specs after a valid type change', async () => {
    const fixture = createFixture();
    fixture.repository.findProduct.mockResolvedValue(
      product({ variants: [], warrantyPolicyId: null }),
    );
    fixture.repository.updateProduct.mockResolvedValue(
      product({
        type: 'ACCESSORY',
        name: 'Accessory',
        slug: 'accessory',
        releaseYear: null,
        chipset: null,
        ramGb: null,
        screenSizeInches: null,
        variants: [],
      }),
    );

    await fixture.service.updateProduct(
      'product-1',
      {
        type: 'ACCESSORY',
        brand: 'Acme',
        name: 'Accessory',
        slug: 'accessory',
        description: 'Description',
        warrantyPolicyId: 'policy-1',
        seoTitle: 'SEO',
        seoDescription: 'SEO description',
      },
      ACTOR,
    );

    expect(fixture.repository.updateProduct).toHaveBeenCalledWith(
      'product-1',
      expect.objectContaining({
        type: 'ACCESSORY',
        brand: 'Acme',
        description: 'Description',
        warrantyPolicy: { connect: { id: 'policy-1' } },
        releaseYear: null,
        chipset: null,
        ramGb: null,
        screenSizeInches: null,
      }),
      fixture.transaction,
    );
  });

  it('maps unique product update conflicts', async () => {
    const fixture = createFixture();
    fixture.repository.findProduct.mockResolvedValue(product());
    fixture.repository.updateProduct.mockRejectedValue({ code: 'P2002' });

    await expect(
      fixture.service.updateProduct('product-1', { slug: 'duplicate' }, ACTOR),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
  });

  it('guards product publishing and publishes active variants with usable policies', async () => {
    const missing = createFixture();
    missing.repository.findProduct.mockResolvedValue(null);
    await expect(missing.service.publishProduct('missing', ACTOR)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });

    const archived = createFixture();
    archived.repository.findProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(archived.service.publishProduct('product-1', ACTOR)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });

    const noActiveVariant = createFixture();
    noActiveVariant.repository.findProduct.mockResolvedValue(
      product({ variants: [variant({ status: 'DRAFT' })] }),
    );
    await expect(noActiveVariant.service.publishProduct('product-1', ACTOR)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'variants', code: 'ACTIVE_VARIANT_REQUIRED' }],
    });

    const success = createFixture();
    success.repository.findProduct.mockResolvedValue(
      product({
        warrantyPolicyId: null,
        variants: [
          variant({ status: 'ACTIVE', warrantyPolicyId: 'policy-1' }),
          variant({ id: 'variant-2', status: 'DRAFT', warrantyPolicyId: 'policy-unused' }),
        ],
      }),
    );
    success.warrantyPolicies.findUsableById.mockResolvedValue({ id: 'policy-1' });
    success.repository.updateProduct.mockResolvedValue(product({ status: 'ACTIVE' }));

    await expect(success.service.publishProduct('product-1', ACTOR)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    expect(success.warrantyPolicies.findUsableById).toHaveBeenCalledTimes(1);
  });

  it('archives a product once with the supplied reason', async () => {
    const missing = createFixture();
    missing.repository.findProduct.mockResolvedValue(null);
    await expect(
      missing.service.archiveProduct('missing', { reason: 'No longer sold' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const archived = createFixture();
    archived.repository.findProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(
      archived.service.archiveProduct('product-1', { reason: 'No longer sold' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const success = createFixture();
    success.repository.findProduct.mockResolvedValue(product());
    success.transaction.product.update.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(
      success.service.archiveProduct('product-1', { reason: 'No longer sold' }, ACTOR),
    ).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(success.audit.write).toHaveBeenLastCalledWith(
      success.transaction,
      ACTOR,
      expect.objectContaining({ metadata: { reason: 'No longer sold' } }),
    );
  });

  it('creates serialized iPhone and quantity accessory variants', async () => {
    const iphone = createFixture();
    iphone.repository.findProduct.mockResolvedValue(product({ type: 'IPHONE' }));
    iphone.repository.createVariant.mockResolvedValue(variant({ inventoryMode: 'SERIALIZED' }));
    await iphone.service.createVariant(
      'product-1',
      { sku: 'IP17-BLK', displayName: 'iPhone Black', storageCapacityGb: 256 },
      ACTOR,
    );
    expect(iphone.repository.createVariant).toHaveBeenCalledWith(
      'product-1',
      'SERIALIZED',
      expect.anything(),
      iphone.transaction,
    );

    const accessory = createFixture();
    accessory.repository.findProduct.mockResolvedValue(product({ type: 'ACCESSORY' }));
    accessory.repository.createVariant.mockResolvedValue(
      variant({ inventoryMode: 'QUANTITY', salePrice: '100000' }),
    );
    await accessory.service.createVariant(
      'product-1',
      { sku: 'CASE', displayName: 'Case', salePrice: '100000' },
      ACTOR,
    );
    expect(accessory.repository.createVariant).toHaveBeenCalledWith(
      'product-1',
      'QUANTITY',
      expect.anything(),
      accessory.transaction,
    );
  });

  it('rejects invalid product state and incompatible variant shapes', async () => {
    const missing = createFixture();
    missing.repository.findProduct.mockResolvedValue(null);
    await expect(
      missing.service.createVariant('missing', { sku: 'A', displayName: 'A' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const archived = createFixture();
    archived.repository.findProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(
      archived.service.createVariant('product-1', { sku: 'A', displayName: 'A' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    for (const [type, input, field, code] of [
      ['IPHONE', { salePrice: '1' }, 'salePrice', 'IPHONE_VARIANT_PRICE_FORBIDDEN'],
      [
        'IPHONE',
        { accessoryAttributes: { size: 'm' } },
        'salePrice',
        'IPHONE_VARIANT_PRICE_FORBIDDEN',
      ],
      ['ACCESSORY', { storageCapacityGb: 128 }, 'storageCapacityGb', 'ACCESSORY_STORAGE_FORBIDDEN'],
      [
        'ACCESSORY',
        { salePrice: '200', compareAtPrice: '100' },
        'compareAtPrice',
        'COMPARE_AT_PRICE_TOO_LOW',
      ],
    ] as const) {
      const fixture = createFixture();
      fixture.repository.findProduct.mockResolvedValue(product({ type }));
      await expect(
        fixture.service.createVariant(
          'product-1',
          { sku: 'SKU', displayName: 'Variant', ...input },
          ACTOR,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field, code }] });
    }
  });

  it('maps unique variant create failures without swallowing generic errors', async () => {
    const unique = createFixture();
    unique.repository.findProduct.mockResolvedValue(product());
    unique.repository.createVariant.mockRejectedValue({ code: 'P2002' });
    await expect(
      unique.service.createVariant('product-1', { sku: 'A', displayName: 'A' }, ACTOR),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });

    const failure = new Error('write failed');
    const generic = createFixture();
    generic.repository.findProduct.mockResolvedValue(product());
    generic.repository.createVariant.mockRejectedValue(failure);
    await expect(
      generic.service.createVariant('product-1', { sku: 'A', displayName: 'A' }, ACTOR),
    ).rejects.toBe(failure);
  });

  it('guards immutable and archived variant updates then persists a valid update', async () => {
    const missing = createFixture();
    missing.repository.findVariant.mockResolvedValue(null);
    await expect(
      missing.service.updateVariant('missing', { sku: 'NEW' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    for (const existing of [
      variant({ status: 'ARCHIVED' }),
      variant({ product: { status: 'ARCHIVED', type: 'IPHONE', warrantyPolicyId: null } }),
    ]) {
      const fixture = createFixture();
      fixture.repository.findVariant.mockResolvedValue(existing);
      await expect(
        fixture.service.updateVariant('variant-1', { displayName: 'New' }, ACTOR),
      ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    }

    const immutable = createFixture();
    immutable.repository.findVariant.mockResolvedValue(
      variant({ _count: { stockLevels: 0, stockMovements: 1, orderItems: 0 } }),
    );
    await expect(
      immutable.service.updateVariant('variant-1', { sku: 'NEW' }, ACTOR),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'sku', code: 'SKU_IMMUTABLE' }],
    });

    const success = createFixture();
    success.repository.findVariant.mockResolvedValue(
      variant({
        product: { status: 'ACTIVE', type: 'ACCESSORY', warrantyPolicyId: null },
        inventoryMode: 'QUANTITY',
        salePrice: '100',
        compareAtPrice: '200',
      }),
    );
    success.repository.updateVariant.mockResolvedValue(
      variant({ inventoryMode: 'QUANTITY', salePrice: '150', compareAtPrice: '200' }),
    );
    await expect(
      success.service.updateVariant('variant-1', { salePrice: '150' }, ACTOR),
    ).resolves.toMatchObject({ salePrice: '150' });
  });

  it('maps unique variant update conflicts and validates the effective price pair', async () => {
    const invalid = createFixture();
    invalid.repository.findVariant.mockResolvedValue(
      variant({
        product: { status: 'ACTIVE', type: 'ACCESSORY', warrantyPolicyId: null },
        inventoryMode: 'QUANTITY',
        salePrice: '100',
        compareAtPrice: '200',
      }),
    );
    await expect(
      invalid.service.updateVariant('variant-1', { salePrice: '300' }, ACTOR),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'compareAtPrice', code: 'COMPARE_AT_PRICE_TOO_LOW' }],
    });

    const unique = createFixture();
    unique.repository.findVariant.mockResolvedValue(variant());
    unique.repository.updateVariant.mockRejectedValue({ code: 'P2002' });
    await expect(
      unique.service.updateVariant('variant-1', { displayName: 'Changed' }, ACTOR),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
  });

  it('guards variant activation requirements and activates a complete variant', async () => {
    const cases = [
      [null, 'RESOURCE_NOT_FOUND', undefined],
      [variant({ status: 'ARCHIVED' }), 'INVALID_STATE_TRANSITION', undefined],
      [
        variant({
          product: { status: 'ARCHIVED', type: 'IPHONE', warrantyPolicyId: null },
        }),
        'INVALID_STATE_TRANSITION',
        undefined,
      ],
      [
        variant({
          product: { status: 'ACTIVE', type: 'ACCESSORY', warrantyPolicyId: null },
          inventoryMode: 'QUANTITY',
          salePrice: null,
        }),
        'VALIDATION_FAILED',
        'SALE_PRICE_REQUIRED',
      ],
      [variant({ storageCapacityGb: null }), 'VALIDATION_FAILED', 'IPHONE_CONFIGURATION_REQUIRED'],
      [variant({ colorName: null }), 'VALIDATION_FAILED', 'IPHONE_CONFIGURATION_REQUIRED'],
    ] as const;

    for (const [existing, code, detailCode] of cases) {
      const fixture = createFixture();
      fixture.repository.findVariant.mockResolvedValue(existing);
      await expect(fixture.service.activateVariant('variant-1', ACTOR)).rejects.toMatchObject(
        detailCode === undefined ? { code } : { code, details: [{ code: detailCode }] },
      );
    }

    const success = createFixture();
    success.repository.findVariant.mockResolvedValue(variant({ warrantyPolicyId: 'policy-1' }));
    success.warrantyPolicies.findUsableById.mockResolvedValue({ id: 'policy-1' });
    success.transaction.productVariant.update.mockResolvedValue(variant({ status: 'ACTIVE' }));
    await expect(success.service.activateVariant('variant-1', ACTOR)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('archives a variant once and audits the reason', async () => {
    const missing = createFixture();
    missing.repository.findVariant.mockResolvedValue(null);
    await expect(
      missing.service.archiveVariant('missing', { reason: 'Retired SKU' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const archived = createFixture();
    archived.repository.findVariant.mockResolvedValue(variant({ status: 'ARCHIVED' }));
    await expect(
      archived.service.archiveVariant('variant-1', { reason: 'Retired SKU' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const success = createFixture();
    success.repository.findVariant.mockResolvedValue(variant());
    success.transaction.productVariant.update.mockResolvedValue(variant({ status: 'ARCHIVED' }));
    await expect(
      success.service.archiveVariant('variant-1', { reason: 'Retired SKU' }, ACTOR),
    ).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(success.audit.write).toHaveBeenLastCalledWith(
      success.transaction,
      ACTOR,
      expect.objectContaining({ metadata: { reason: 'Retired SKU' } }),
    );
  });

  it('protects product and variant media owners from missing or archived resources', async () => {
    const fixture = createFixture();
    fixture.repository.findProduct.mockResolvedValue(null);
    await expect(fixture.service.assertProductMediaOwner('missing')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    fixture.repository.findProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    await expect(fixture.service.assertProductMediaOwner('product-1')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    fixture.repository.findProduct.mockResolvedValue(product());
    await expect(fixture.service.assertProductMediaOwner('product-1')).resolves.toMatchObject({
      id: 'product-1',
    });

    fixture.repository.findVariant.mockResolvedValue(null);
    await expect(fixture.service.assertVariantMediaOwner('missing')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    fixture.repository.findVariant.mockResolvedValue(variant({ status: 'ARCHIVED' }));
    await expect(fixture.service.assertVariantMediaOwner('variant-1')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    fixture.repository.findVariant.mockResolvedValue(
      variant({ product: { status: 'ARCHIVED', type: 'IPHONE', warrantyPolicyId: null } }),
    );
    await expect(fixture.service.assertVariantMediaOwner('variant-1')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    fixture.repository.findVariant.mockResolvedValue(variant());
    await expect(fixture.service.assertVariantMediaOwner('variant-1')).resolves.toMatchObject({
      id: 'variant-1',
    });
  });
});

function createFixture() {
  const transaction = {
    product: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  };
  const repository = {
    listProducts: vi.fn(),
    findProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    findVariant: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
  };
  const transactions = {
    run: vi.fn((_name: string, work: (client: typeof transaction) => unknown) => work(transaction)),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const warrantyPolicies = { findUsableById: vi.fn().mockResolvedValue({ id: 'policy-1' }) };
  return {
    service: new BackofficeCatalogService(
      repository as never,
      transactions as never,
      audit,
      { storage: { url: 'https://storage.test/' } } as never,
      warrantyPolicies as never,
    ),
    repository,
    transactions,
    transaction,
    audit,
    warrantyPolicies,
  };
}

function createProduct(overrides: Record<string, unknown> = {}) {
  return {
    type: 'IPHONE' as const,
    brand: 'Apple',
    name: 'iPhone 17',
    slug: 'iphone-17',
    releaseYear: 2026,
    ...overrides,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    type: 'IPHONE',
    brand: 'Apple',
    name: 'iPhone 17',
    slug: 'iphone-17',
    description: null,
    releaseYear: 2026,
    chipset: 'A20',
    ramGb: 8,
    screenSizeInches: '6.3',
    warrantyPolicyId: null,
    seoTitle: null,
    seoDescription: null,
    status: 'DRAFT',
    archivedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    _count: { variants: 1 },
    variants: [variant()],
    media: [],
    ...overrides,
  };
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'variant-1',
    productId: 'product-1',
    sku: 'IP17-256-BLK',
    displayName: 'iPhone 17 256GB Black',
    storageCapacityGb: 256,
    colorName: 'Black',
    colorHex: '#000000',
    inventoryMode: 'SERIALIZED',
    salePrice: null,
    compareAtPrice: null,
    accessoryAttributes: null,
    warrantyPolicyId: null,
    status: 'DRAFT',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    product: { status: 'ACTIVE', type: 'IPHONE', warrantyPolicyId: null },
    _count: { stockLevels: 0, stockMovements: 0, orderItems: 0 },
    ...overrides,
  };
}
