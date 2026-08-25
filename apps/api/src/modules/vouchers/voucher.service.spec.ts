/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { VoucherService } from './voucher.service.js';

const ACTOR = {
  actorUserId: '0198e6c6-5798-7cde-a964-8eb51811915f',
  requestId: 'request-voucher-service',
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
};

const UUIDS = {
  voucher: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
  product: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e2',
  variant: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e3',
};

describe('VoucherService', () => {
  it('keeps account-only discovery private from guests without touching the repository', async () => {
    const fixture = createFixture();

    const result = await fixture.service.listPublic({
      visibility: 'ACCOUNT_ONLY',
      page: 2,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
    expect(fixture.repository.listPublic).not.toHaveBeenCalled();
  });

  it('filters exhausted quota and projects every public scope deterministically', async () => {
    const fixture = createFixture();
    fixture.repository.listPublic.mockResolvedValue({
      items: [
        voucher({ code: 'ORDER', totalUsageLimit: null }),
        voucher({
          code: 'IPHONE',
          scopeType: 'PRODUCT_TYPE',
          scopeConfig: { productType: 'IPHONE' },
        }),
        voucher({
          code: 'ACCESSORY',
          scopeType: 'PRODUCT_TYPE',
          scopeConfig: { productType: 'ACCESSORY' },
        }),
        voucher({
          code: 'PRODUCTS',
          scopeType: 'PRODUCTS',
          scopeConfig: { productIds: [UUIDS.product] },
        }),
        voucher({
          code: 'VARIANTS',
          scopeType: 'VARIANTS',
          scopeConfig: { variantIds: [UUIDS.variant] },
        }),
        voucher({
          code: 'EXHAUSTED',
          totalUsageLimit: 2,
          usages: [{ status: 'RESERVED' }, { status: 'CONSUMED' }, { status: 'RELEASED' }],
        }),
      ],
      totalItems: 6,
    });

    const result = await fixture.service.listPublic({ page: 1, pageSize: 20 }, {
      role: 'CUSTOMER',
    } as never);

    expect(fixture.repository.listPublic).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [
      'PUBLIC',
      'ACCOUNT_ONLY',
    ]);
    expect(result.items.map((item) => item.scopeSummary)).toEqual([
      'Toàn bộ đơn hàng',
      'Sản phẩm iPhone',
      'Sản phẩm phụ kiện',
      '1 sản phẩm được chọn',
      '1 phiên bản được chọn',
    ]);
    expect(result.pagination).toMatchObject({ totalItems: 6, totalPages: 1 });
  });

  it('returns zero public totals when all repository rows are exhausted', async () => {
    const fixture = createFixture();
    fixture.repository.listPublic.mockResolvedValue({
      items: [voucher({ totalUsageLimit: 1, usages: [{ status: 'RESERVED' }] })],
      totalItems: 1,
    });

    const result = await fixture.service.listPublic({ page: 1, pageSize: 20 });

    expect(result.items).toEqual([]);
    expect(result.pagination.totalItems).toBe(0);
  });

  it('projects backoffice lists, usage counts, detail and usage pagination', async () => {
    const fixture = createFixture();
    const record = voucher({
      usages: [{ status: 'RESERVED' }, { status: 'CONSUMED' }, { status: 'RELEASED' }],
    });
    fixture.repository.listBackoffice.mockResolvedValue({ items: [record], totalItems: 21 });
    fixture.repository.find.mockResolvedValue(record);
    fixture.repository.listUsages.mockResolvedValue({
      items: [
        {
          id: 'usage-1',
          orderId: 'order-1',
          customerId: null,
          status: 'RESERVED',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          consumedAt: null,
          releasedAt: null,
        },
      ],
      totalItems: 1,
    });

    const list = await fixture.service.listBackoffice({ page: 2, pageSize: 20 });
    const detail = await fixture.service.get(UUIDS.voucher);
    const usages = await fixture.service.listUsages(UUIDS.voucher, { page: 1, pageSize: 10 });

    expect(list.pagination).toMatchObject({ totalItems: 21, totalPages: 2 });
    expect(detail).toMatchObject({
      discountValue: '10000',
      maxDiscountAmount: null,
      usageCounts: { reserved: 1, consumed: 1, released: 1 },
    });
    expect(usages).toMatchObject({
      items: [{ id: 'usage-1', customerId: null, status: 'RESERVED' }],
      pagination: { totalItems: 1, totalPages: 1 },
    });
  });

  it('hides missing voucher details and usage ownership with not found', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(null);

    await expect(fixture.service.get(UUIDS.voucher)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await expect(
      fixture.service.listUsages(UUIDS.voucher, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('creates a product-scoped draft, validates targets and writes a safe audit', async () => {
    const fixture = createFixture();
    fixture.transaction.product.count.mockResolvedValue(1);
    fixture.transaction.voucher.create.mockResolvedValue(
      voucher({
        status: 'DRAFT',
        scopeType: 'PRODUCTS',
        scopeConfig: { productIds: [UUIDS.product] },
      }),
    );
    const input = createInput({
      scopeType: 'PRODUCTS',
      scopeConfig: { productIds: [UUIDS.product] },
      visibility: 'ACCOUNT_ONLY',
      perCustomerLimit: 1,
    });

    const result = await fixture.service.create(input as never, ACTOR);

    expect(result).toMatchObject({ status: 'DRAFT', scopeType: 'PRODUCTS' });
    expect(fixture.transaction.product.count).toHaveBeenCalledOnce();
    expect(fixture.transaction.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'WELCOME',
          normalizedCode: 'WELCOME',
          status: 'DRAFT',
        }),
      }),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      ACTOR,
      expect.objectContaining({ action: 'voucher.created', resourceId: UUIDS.voucher }),
    );
  });

  it('rejects missing product and variant scope targets before persistence', async () => {
    const productFixture = createFixture();
    productFixture.transaction.product.count.mockResolvedValue(0);
    await expect(
      productFixture.service.create(
        createInput({
          scopeType: 'PRODUCTS',
          scopeConfig: { productIds: [UUIDS.product] },
        }) as never,
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const variantFixture = createFixture();
    variantFixture.transaction.productVariant.count.mockResolvedValue(0);
    await expect(
      variantFixture.service.create(
        createInput({
          scopeType: 'VARIANTS',
          scopeConfig: { variantIds: [UUIDS.variant] },
        }) as never,
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it.each([
    ['zero discount', { discountValue: '0' }],
    ['negative minimum', { minimumOrderAmount: '-1' }],
    ['reversed interval', { endsAt: '2026-07-31T00:00:00.000Z' }],
    ['fixed cap', { maxDiscountAmount: '5000' }],
    ['percent over 100', { discountType: 'PERCENT', discountValue: '101' }],
    [
      'non-positive percent cap',
      { discountType: 'PERCENT', discountValue: '10', maxDiscountAmount: '0' },
    ],
    ['public per-customer limit', { visibility: 'PUBLIC', perCustomerLimit: 1 }],
  ])('rejects an invalid %s rule', async (_caseName, overrides) => {
    const fixture = createFixture();

    await expect(
      fixture.service.create(createInput(overrides) as never, ACTOR),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fixture.transactions.run).not.toHaveBeenCalled();
  });

  it('maps only Prisma unique failures and preserves unrelated create failures', async () => {
    const uniqueFixture = createFixture();
    uniqueFixture.transaction.voucher.create.mockRejectedValue({ code: 'P2002' });
    await expect(uniqueFixture.service.create(createInput() as never, ACTOR)).rejects.toMatchObject(
      { code: 'DUPLICATE_RESOURCE' },
    );

    const failure = new Error('storage unavailable');
    const genericFixture = createFixture();
    genericFixture.transaction.voucher.create.mockRejectedValue(failure);
    await expect(genericFixture.service.create(createInput() as never, ACTOR)).rejects.toBe(
      failure,
    );
  });

  it('allows descriptive updates on active vouchers but rejects rule mutation', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(voucher({ status: 'ACTIVE' }));
    fixture.transaction.voucher.update.mockResolvedValue(
      voucher({ status: 'ACTIVE', name: 'New' }),
    );

    const updated = await fixture.service.update(UUIDS.voucher, { name: 'New' }, ACTOR);
    expect(updated.name).toBe('New');
    expect(fixture.transaction.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'New' } }),
    );

    await expect(
      fixture.service.update(UUIDS.voucher, { discountValue: '20000' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('enforces archived and used-paused mutability while allowing a hold extension', async () => {
    const archived = createFixture();
    archived.repository.find.mockResolvedValue(voucher({ status: 'ARCHIVED' }));
    await expect(
      archived.service.update(UUIDS.voucher, { name: 'No' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    const used = voucher({
      status: 'PAUSED',
      endsAt: new Date('2026-09-01T00:00:00.000Z'),
      usages: [{ status: 'CONSUMED' }],
    });
    const paused = createFixture();
    paused.repository.find.mockResolvedValue(used);
    await expect(
      paused.service.update(UUIDS.voucher, { minimumOrderAmount: '1' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await expect(
      paused.service.update(UUIDS.voucher, { endsAt: '2026-08-15T00:00:00.000Z' }, ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    paused.transaction.voucher.update.mockResolvedValue(
      voucher({ status: 'PAUSED', endsAt: new Date('2026-10-01T00:00:00.000Z') }),
    );
    const extended = await paused.service.update(
      UUIDS.voucher,
      { endsAt: '2026-10-01T00:00:00.000Z' },
      ACTOR,
    );
    expect(extended.endsAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('updates every nullable rule field and persists JSON null explicitly', async () => {
    const fixture = createFixture();
    fixture.repository.find.mockResolvedValue(voucher({ status: 'DRAFT' }));
    fixture.transaction.voucher.update.mockResolvedValue(
      voucher({
        name: 'Changed',
        description: null,
        discountType: 'PERCENT',
        discountValue: '25',
        maxDiscountAmount: null,
        totalUsageLimit: null,
        perCustomerLimit: null,
        visibility: 'ACCOUNT_ONLY',
        scopeConfig: null,
      }),
    );

    await fixture.service.update(
      UUIDS.voucher,
      {
        name: 'Changed',
        description: null,
        discountType: 'PERCENT',
        discountValue: '25',
        maxDiscountAmount: null,
        minimumOrderAmount: '1000',
        startsAt: '2026-08-02T00:00:00.000Z',
        endsAt: '2026-09-02T00:00:00.000Z',
        totalUsageLimit: null,
        perCustomerLimit: null,
        visibility: 'ACCOUNT_ONLY',
        scopeType: 'ORDER',
        scopeConfig: null,
      },
      ACTOR,
    );

    expect(fixture.transaction.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxDiscountAmount: null,
          totalUsageLimit: null,
          perCustomerLimit: null,
          scopeConfig: Prisma.DbNull,
        }),
      }),
    );
  });

  it('covers activation, pause and archive transition guards and audit metadata', async () => {
    const missing = createFixture();
    missing.repository.find.mockResolvedValue(null);
    await expect(missing.service.activate(UUIDS.voucher, ACTOR)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });

    const expired = createFixture();
    expired.repository.find.mockResolvedValue(
      voucher({ status: 'DRAFT', endsAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    await expect(expired.service.activate(UUIDS.voucher, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });

    const invalid = createFixture();
    invalid.repository.find.mockResolvedValue(voucher({ status: 'ACTIVE' }));
    await expect(invalid.service.activate(UUIDS.voucher, ACTOR)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    await expect(
      invalid.service.archive(UUIDS.voucher, 'already archived', ACTOR),
    ).resolves.toMatchObject({ status: 'ARCHIVED' });

    const activation = createFixture();
    activation.repository.find.mockResolvedValue(
      voucher({
        status: 'PAUSED',
        scopeType: 'VARIANTS',
        scopeConfig: { variantIds: [UUIDS.variant] },
      }),
    );
    activation.transaction.voucher.update.mockResolvedValue(voucher({ status: 'ACTIVE' }));
    await expect(activation.service.activate(UUIDS.voucher, ACTOR)).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    expect(activation.transaction.productVariant.count).toHaveBeenCalledOnce();
    expect(activation.audit.write).toHaveBeenLastCalledWith(
      activation.transaction,
      ACTOR,
      expect.not.objectContaining({ metadata: expect.anything() }),
    );

    const transitions = createFixture();
    transitions.repository.find.mockResolvedValue(voucher({ status: 'ACTIVE' }));
    transitions.transaction.voucher.update.mockImplementation(
      ({ data }: { data: { status: string } }) => Promise.resolve(voucher({ status: data.status })),
    );
    await expect(
      transitions.service.pause(UUIDS.voucher, 'campaign stopped', ACTOR),
    ).resolves.toMatchObject({ status: 'PAUSED' });
    expect(transitions.audit.write).toHaveBeenLastCalledWith(
      transitions.transaction,
      ACTOR,
      expect.objectContaining({ metadata: { reason: 'campaign stopped' } }),
    );

    transitions.repository.find.mockResolvedValue(voucher({ status: 'DRAFT' }));
    await expect(
      transitions.service.pause(UUIDS.voucher, 'invalid pause', ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    transitions.repository.find.mockResolvedValue(voucher({ status: 'ARCHIVED' }));
    await expect(
      transitions.service.archive(UUIDS.voucher, 'already archived', ACTOR),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });
});

function createFixture() {
  const transaction = {
    voucher: {
      create: vi.fn().mockResolvedValue(voucher()),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: { status?: string } }) =>
          Promise.resolve(voucher({ status: data.status ?? 'DRAFT' })),
        ),
    },
    product: { count: vi.fn().mockResolvedValue(1) },
    productVariant: { count: vi.fn().mockResolvedValue(1) },
  };
  const repository = {
    listPublic: vi.fn(),
    listBackoffice: vi.fn(),
    find: vi.fn(),
    listUsages: vi.fn(),
    lock: vi.fn().mockResolvedValue(undefined),
  };
  const transactions = {
    run: vi.fn((_name: string, work: (client: typeof transaction) => unknown) => work(transaction)),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new VoucherService(repository as never, transactions as never, audit),
    repository,
    transactions,
    transaction,
    audit,
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    code: 'WELCOME',
    name: 'Welcome discount',
    discountType: 'FIXED',
    discountValue: '10000',
    minimumOrderAmount: '0',
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2099-09-01T00:00:00.000Z',
    visibility: 'PUBLIC',
    scopeType: 'ORDER',
    ...overrides,
  };
}

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: UUIDS.voucher,
    code: 'WELCOME',
    normalizedCode: 'WELCOME',
    name: 'Welcome discount',
    description: null,
    discountType: 'FIXED',
    discountValue: '10000',
    maxDiscountAmount: null,
    minimumOrderAmount: '0',
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: new Date('2099-09-01T00:00:00.000Z'),
    totalUsageLimit: null,
    perCustomerLimit: null,
    visibility: 'PUBLIC',
    scopeType: 'ORDER',
    scopeConfig: null,
    status: 'DRAFT',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    usages: [],
    ...overrides,
  };
}
