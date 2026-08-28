import { describe, expect, it } from 'vitest';
import { customerOrdersHref, parseCustomerOrderQuery } from './customer-orders-view';

describe('customer order query state', () => {
  it('allowlists filters, sorting and positive pages', () => {
    const query = parseCustomerOrderQuery(
      new URLSearchParams(
        'status=PROCESSING&fulfillmentType=SHIPPING&page=3&sortBy=grandTotal&sortOrder=asc&token=secret',
      ),
    );
    expect(query).toEqual({
      status: 'PROCESSING',
      fulfillmentType: 'SHIPPING',
      page: 3,
      pageSize: 10,
      sortBy: 'grandTotal',
      sortOrder: 'asc',
    });
    expect(customerOrdersHref(query)).toBe(
      '/orders?status=PROCESSING&fulfillmentType=SHIPPING&page=3&sortBy=grandTotal&sortOrder=asc',
    );
  });

  it('falls back safely for unsupported values', () => {
    expect(parseCustomerOrderQuery(new URLSearchParams('status=HACK&page=-1&sortBy=x'))).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: 'placedAt',
      sortOrder: 'desc',
    });
  });
});
