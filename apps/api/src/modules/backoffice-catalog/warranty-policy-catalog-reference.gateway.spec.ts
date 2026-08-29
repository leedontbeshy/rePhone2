import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { WarrantyPolicyCatalogReferenceGateway } from './warranty-policy-catalog-reference.gateway.js';

describe('WarrantyPolicyCatalogReferenceGateway', () => {
  it('counts only ACTIVE Product and Variant references sequentially', async () => {
    const sequence: string[] = [];
    const productCount = vi.fn(() => (sequence.push('product'), Promise.resolve(1)));
    const variantCount = vi.fn(() => (sequence.push('variant'), Promise.resolve(2)));
    const gateway = new WarrantyPolicyCatalogReferenceGateway({
      product: { count: productCount },
      productVariant: { count: variantCount },
    } as unknown as PrismaService);

    await expect(gateway.countActiveReferences('policy-1')).resolves.toEqual({
      products: 1,
      variants: 2,
    });
    await expect(gateway.hasActiveReferences('policy-1')).resolves.toBe(true);
    expect(sequence).toEqual(['product', 'variant', 'product', 'variant']);
    expect(productCount).toHaveBeenCalledTimes(2);
    expect(productCount).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', warrantyPolicyId: 'policy-1' },
    });
    expect(variantCount).toHaveBeenCalledTimes(2);
    expect(variantCount).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', warrantyPolicyId: 'policy-1' },
    });
  });
});
