import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import { BackofficeOrderCostReader } from './backoffice-order-cost.reader.js';

function setup(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const reader = new BackofficeOrderCostReader({
    orderItem: { findMany },
  } as unknown as PrismaService);
  return { reader, findMany };
}

describe('backoffice current order costs', () => {
  it.each(['EMPLOYEE', 'CUSTOMER'] as const)('does not even read costs for %s', async (role) => {
    const { reader, findMany } = setup([]);
    expect(await reader.read(['order-1'], role)).toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('batches the page and preserves missing costs instead of claiming a complete total', async () => {
    const { reader, findMany } = setup([
      {
        id: 'item-1',
        orderId: 'order-1',
        quantity: 2,
        inventoryUnit: { id: 'unit-1', acquisitionCost: '5000000', additionalCost: '200000' },
      },
      { id: 'item-2', orderId: 'order-1', quantity: 3, inventoryUnit: null },
      {
        id: 'item-3',
        orderId: 'order-2',
        quantity: 1,
        inventoryUnit: { id: 'unit-2', acquisitionCost: null, additionalCost: '100000' },
      },
    ]);
    const result = await reader.read(['order-1', 'order-2', 'order-1'], 'ADMIN');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { orderId: { in: ['order-1', 'order-2'] } },
    });
    expect(result.get('order-1')?.summary).toEqual({
      source: 'CURRENT_INVENTORY',
      knownCost: '10400000',
      totalCost: null,
      missingQuantity: 3,
    });
    expect(result.get('order-1')?.items.get('item-1')).toEqual({
      inventoryUnitId: 'unit-1',
      acquisitionCost: '5000000',
      additionalCost: '200000',
      unitCost: '5200000',
      lineCost: '10400000',
    });
    expect(result.get('order-2')?.summary).toEqual({
      source: 'CURRENT_INVENTORY',
      knownCost: '0',
      totalCost: null,
      missingQuantity: 1,
    });
  });

  it('distinguishes recorded zero from missing and uses integer arithmetic for large totals', async () => {
    const { reader } = setup([
      {
        id: 'zero',
        orderId: 'zero-order',
        quantity: 1,
        inventoryUnit: { id: 'zero-unit', acquisitionCost: '0', additionalCost: '0' },
      },
      {
        id: 'large',
        orderId: 'large-order',
        quantity: 7,
        inventoryUnit: {
          id: 'large-unit',
          acquisitionCost: '999999999999999',
          additionalCost: '999999999999999',
        },
      },
    ]);
    const result = await reader.read(['zero-order', 'large-order'], 'ADMIN');
    expect(result.get('zero-order')?.summary).toMatchObject({ totalCost: '0', missingQuantity: 0 });
    expect(result.get('large-order')?.summary.totalCost).toBe('13999999999999986');
  });

  it('skips an empty result page', async () => {
    const { reader, findMany } = setup([]);
    expect(await reader.read([], 'ADMIN')).toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });
});
