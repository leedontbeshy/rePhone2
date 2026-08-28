import type { components } from '@rephone/api-client';
import { customerApiError } from './order-access';

export type CustomerOrder = components['schemas']['OrderDetailDto'];
export type CustomerOrderListItem = components['schemas']['OrderListItemDto'];
export type CustomerOrderStatus = 'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export type CustomerOrderFulfillmentType = 'PICKUP' | 'SHIPPING';
export type CustomerOrderSortBy = 'placedAt' | 'grandTotal' | 'status';
export type CustomerOrderSortOrder = 'asc' | 'desc';

export interface CustomerOrderListQuery {
  status?: CustomerOrderStatus;
  fulfillmentType?: CustomerOrderFulfillmentType;
  page: number;
  pageSize: number;
  sortBy: CustomerOrderSortBy;
  sortOrder: CustomerOrderSortOrder;
}

export interface CustomerOrderListResult {
  data: CustomerOrderListItem[];
  pagination: components['schemas']['OrderPaginationDto'];
}

interface RuntimeApiResult {
  data?: unknown;
  error?: unknown;
}

export interface CustomerOrdersClient {
  GET(path: string, options?: unknown): Promise<RuntimeApiResult>;
  POST(path: string, options?: unknown): Promise<RuntimeApiResult>;
}

export class CustomerOrderApiError extends Error {
  public readonly code: string | undefined;
  public readonly conflict: boolean;
  public readonly notFound: boolean;

  public constructor(message: string, code?: string) {
    super(message);
    this.name = 'CustomerOrderApiError';
    this.code = code;
    this.conflict = code === 'INVALID_STATE_TRANSITION' || code === 'CONCURRENT_MODIFICATION';
    this.notFound = code === 'ORDER_NOT_FOUND' || code === 'RESOURCE_NOT_FOUND';
  }
}

export async function listCustomerOrders(
  client: CustomerOrdersClient,
  query: CustomerOrderListQuery,
): Promise<CustomerOrderListResult> {
  const result = await client.GET('/api/v1/orders', { params: { query } });
  const envelope = unwrap(result, 'Không thể tải danh sách đơn hàng.');
  const data = Array.isArray(envelope['data']) ? envelope['data'] : [];
  const meta = record(envelope['meta']);
  const pagination = record(meta['pagination']);
  return {
    data: data as CustomerOrderListItem[],
    pagination: {
      page: numberOr(pagination['page'], query.page),
      pageSize: numberOr(pagination['pageSize'], query.pageSize),
      totalItems: numberOr(pagination['totalItems'], data.length),
      totalPages: numberOr(pagination['totalPages'], data.length === 0 ? 0 : 1),
    },
  };
}

export async function getCustomerOrder(
  client: CustomerOrdersClient,
  orderNumber: string,
  guestOrderToken?: string,
): Promise<CustomerOrder> {
  const result = await client.GET('/api/v1/orders/{orderNumber}', {
    params: {
      path: { orderNumber },
      header: guestOrderToken ? { 'X-Guest-Order-Token': guestOrderToken } : {},
    },
  });
  return unwrap(result, 'Không thể mở đơn hàng này.')['data'] as CustomerOrder;
}

export async function cancelCustomerOrder(
  client: CustomerOrdersClient,
  orderNumber: string,
  reason: string,
  guestOrderToken?: string,
): Promise<CustomerOrder> {
  const result = await client.POST('/api/v1/orders/{orderNumber}/cancel', {
    params: {
      path: { orderNumber },
      header: {
        'X-Rephone-CSRF': '1',
        ...(guestOrderToken ? { 'X-Guest-Order-Token': guestOrderToken } : {}),
      },
    },
    body: { reason },
  });
  return unwrap(result, 'Không thể hủy đơn hàng.')['data'] as CustomerOrder;
}

function unwrap(result: RuntimeApiResult, fallback: string): Record<string, unknown> {
  if (result.data !== undefined && isRecord(result.data)) return result.data;
  const code = errorCode(result.error);
  throw new CustomerOrderApiError(customerApiError(result.error, fallback), code);
}

function errorCode(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value['error'])) return undefined;
  return typeof value['error']['code'] === 'string' ? value['error']['code'] : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
