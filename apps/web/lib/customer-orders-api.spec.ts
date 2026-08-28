import { describe, expect, it, vi } from 'vitest';
import { cancelCustomerOrder, getCustomerOrder, listCustomerOrders } from './customer-orders-api';

describe('customer orders api', () => {
  it('sends only the allowlisted list query', async () => {
    const client = {
      GET: vi.fn().mockResolvedValue({
        data: {
          data: [],
          meta: { pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 } },
        },
      }),
      POST: vi.fn(),
    };
    const query = {
      status: 'PROCESSING' as const,
      fulfillmentType: 'SHIPPING' as const,
      page: 2,
      pageSize: 10,
      sortBy: 'placedAt' as const,
      sortOrder: 'desc' as const,
    };
    await expect(listCustomerOrders(client, query)).resolves.toMatchObject({
      pagination: { page: 2 },
    });
    expect(client.GET).toHaveBeenCalledWith('/api/v1/orders', { params: { query } });
  });

  it('does not send a guest header without an explicit guest credential', async () => {
    const order = { orderNumber: 'RPH-1' };
    const client = { GET: vi.fn().mockResolvedValue({ data: { data: order } }), POST: vi.fn() };
    await getCustomerOrder(client, 'RPH-1');
    expect(client.GET).toHaveBeenCalledWith('/api/v1/orders/{orderNumber}', {
      params: { path: { orderNumber: 'RPH-1' }, header: {} },
    });
  });

  it('adds the order-scoped guest credential and mutation guard when supplied', async () => {
    const order = { orderNumber: 'RPH-1' };
    const client = { GET: vi.fn(), POST: vi.fn().mockResolvedValue({ data: { data: order } }) };
    await cancelCustomerOrder(client, 'RPH-1', 'Không còn nhu cầu', 'A'.repeat(43));
    expect(client.POST).toHaveBeenCalledWith(
      '/api/v1/orders/{orderNumber}/cancel',
      expect.objectContaining({
        params: {
          path: { orderNumber: 'RPH-1' },
          header: { 'X-Rephone-CSRF': '1', 'X-Guest-Order-Token': 'A'.repeat(43) },
        },
      }),
    );
  });
});
