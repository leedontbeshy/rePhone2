import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { WarrantyPolicyReader } from './warranty-policy.reader.js';

describe('WarrantyPolicyReader', () => {
  it('reads only ACTIVE, non-archived policies for future catalog assignment', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const reader = new WarrantyPolicyReader({
      warrantyPolicy: { findFirst },
    } as unknown as PrismaService);

    await expect(reader.findUsableById('policy-1')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'policy-1', status: 'ACTIVE', archivedAt: null } }),
    );
  });
});
