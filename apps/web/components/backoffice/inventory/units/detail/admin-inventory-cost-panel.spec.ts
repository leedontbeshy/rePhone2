import { describe, expect, it, vi } from 'vitest';
import { loadAdminCostWhenAllowed } from './admin-inventory-cost-panel';

describe('FE-06 admin inventory cost compartment', () => {
  it('never invokes the cost loader for an employee', async () => {
    const loader = vi.fn(() => Promise.resolve({ totalCost: '1000000' }));

    await expect(loadAdminCostWhenAllowed('EMPLOYEE', loader)).resolves.toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('allows an administrator to load the isolated cost resource', async () => {
    const value = { totalCost: '1000000' };
    const loader = vi.fn(() => Promise.resolve(value));

    await expect(loadAdminCostWhenAllowed('ADMIN', loader)).resolves.toBe(value);
    expect(loader).toHaveBeenCalledOnce();
  });
});
