import { describe, expect, it, vi } from 'vitest';
import { BackofficeCatalogService } from './backoffice-catalog.service.js';

describe('BackofficeCatalogService warranty policy activation gate', () => {
  it('blocks publishing when the product or an active variant references an unusable policy', async () => {
    const findUsableById = vi.fn().mockResolvedValue(null);
    const updateProduct = vi.fn();
    const service = createService(
      {
        findProduct: vi.fn().mockResolvedValue({
          id: 'product-1',
          status: 'DRAFT',
          warrantyPolicyId: 'policy-1',
          variants: [{ status: 'ACTIVE', warrantyPolicyId: null }],
        }),
        updateProduct,
      },
      findUsableById,
    );

    await expect(service.publishProduct('product-1', actor())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'warrantyPolicyId', code: 'WARRANTY_POLICY_NOT_ACTIVE' }],
    });
    expect(findUsableById).toHaveBeenCalledWith('policy-1', expect.anything());
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('blocks activating a variant when its effective policy is inactive or archived', async () => {
    const findUsableById = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const service = createService(
      {
        findVariant: vi.fn().mockResolvedValue({
          id: 'variant-1',
          status: 'DRAFT',
          warrantyPolicyId: null,
          salePrice: '1000000',
          storageCapacityGb: null,
          colorName: null,
          product: {
            status: 'ACTIVE',
            type: 'ACCESSORY',
            warrantyPolicyId: 'policy-2',
          },
        }),
      },
      findUsableById,
      update,
    );

    await expect(service.activateVariant('variant-1', actor())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'warrantyPolicyId', code: 'WARRANTY_POLICY_NOT_ACTIVE' }],
    });
    expect(findUsableById).toHaveBeenCalledWith('policy-2', expect.anything());
    expect(update).not.toHaveBeenCalled();
  });
});

function createService(
  repository: Record<string, unknown>,
  findUsableById: ReturnType<typeof vi.fn>,
  variantUpdate = vi.fn(),
) {
  const transaction = { productVariant: { update: variantUpdate } };
  return new BackofficeCatalogService(
    repository as never,
    {
      run: vi.fn((_name: string, work: (client: unknown) => unknown) => work(transaction)),
    } as never,
    { write: vi.fn() },
    { storage: { publicBucket: 'public-test' } } as never,
    { findUsableById } as never,
  );
}

function actor() {
  return {
    actorUserId: '0198e6c6-5798-7cde-a964-8eb51811915f',
    requestId: 'request-slice11-catalog-policy',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };
}
