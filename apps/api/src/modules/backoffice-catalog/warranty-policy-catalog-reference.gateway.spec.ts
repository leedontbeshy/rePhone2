import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { WarrantyPolicyCatalogReferenceGateway } from './warranty-policy-catalog-reference.gateway.js';

describe('WarrantyPolicyCatalogReferenceGateway', () => {
  it('counts only ACTIVE Product and Variant references sequentially', async () => {
    const sequence: string[] = [];
    const gateway = new WarrantyPolicyCatalogReferenceGateway({
      product: { count: vi.fn(() => (sequence.push('product'), Promise.resolve(1))) },
      productVariant: { count: vi.fn(() => (sequence.push('variant'), Promise.resolve(2))) },
    } as unknown as PrismaService);

    await expect(gateway.countActiveReferences('policy-1')).resolves.toEqual({
      products: 1,
      variants: 2,
    });
    await expect(gateway.hasActiveReferences('policy-1')).resolves.toBe(true);
    expect(sequence).toEqual(['product', 'variant', 'product', 'variant']);
  });
});
