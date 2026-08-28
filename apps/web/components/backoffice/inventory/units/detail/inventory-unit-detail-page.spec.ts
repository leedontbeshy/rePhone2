import { describe, expect, it, vi } from 'vitest';
import { InventoryAdminError } from '@/lib/backoffice-inventory-api';
import { refetchAfterInventoryConflict } from './inventory-unit-detail-page';

describe('FE-06 inventory unit detail refetch policy', () => {
  it('refetches the authoritative projection after a conflict', async () => {
    const refetch = vi.fn(() => Promise.resolve());
    const conflict = new InventoryAdminError(
      'Dữ liệu vừa thay đổi.',
      'CONCURRENT_MODIFICATION',
    );

    await expect(refetchAfterInventoryConflict(conflict, refetch)).resolves.toBe(true);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not refetch for an ordinary validation error', async () => {
    const refetch = vi.fn(() => Promise.resolve());
    const validation = new InventoryAdminError('Thông tin chưa hợp lệ.', 'VALIDATION_FAILED');

    await expect(refetchAfterInventoryConflict(validation, refetch)).resolves.toBe(false);
    expect(refetch).not.toHaveBeenCalled();
  });
});
