import { type components, type createApiClient } from '@rephone/api-client';
import { apiError, customerApiError } from './order-access';

export type WarrantyApiClient = ReturnType<typeof createApiClient>;
export type WarrantyListItem = components['schemas']['WarrantyListItemDto'];
export type WarrantyDetail = components['schemas']['WarrantyDetailDto'];
export type WarrantyPolicy = components['schemas']['WarrantyPolicyDto'];
export type BackofficeWarrantyListItem = components['schemas']['BackofficeWarrantyListItemDto'];
export type BackofficeWarrantyDetail = components['schemas']['BackofficeWarrantyDetailDto'];
export type CreateWarrantyPolicyInput = components['schemas']['CreateWarrantyPolicyDto'];
export type UpdateWarrantyPolicyInput = components['schemas']['UpdateWarrantyPolicyDto'];

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface WarrantyPage<T> {
  data: T[];
  pagination: Pagination;
}

export interface CustomerWarrantyQuery {
  page: number;
  pageSize: number;
}

export interface WarrantyPolicyQuery extends CustomerWarrantyQuery {
  q?: string;
  status?: '' | 'ACTIVE' | 'INACTIVE';
  archived?: '' | 'true' | 'false';
}

export interface BackofficeWarrantyQuery extends CustomerWarrantyQuery {
  q?: string;
  status?: '' | 'ACTIVE' | 'VOIDED';
  validity?: '' | 'VALID' | 'EXPIRED' | 'NOT_STARTED';
  customerId?: string;
}

export async function listCustomerWarranties(
  client: WarrantyApiClient,
  query: CustomerWarrantyQuery,
): Promise<WarrantyPage<WarrantyListItem>> {
  const result = await client.GET('/api/v1/warranties', { params: { query } });
  if (result.data === undefined)
    throw new Error(customerWarrantyError(result.error, 'Không thể tải bảo hành.'));
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function getCustomerWarranty(
  client: WarrantyApiClient,
  warrantyCode: string,
  guestOrderToken?: string,
): Promise<WarrantyDetail> {
  const result = await client.GET('/api/v1/warranties/{warrantyCode}', {
    params: {
      path: { warrantyCode },
      header: guestOrderToken === undefined ? {} : { 'X-Guest-Order-Token': guestOrderToken },
    },
  });
  if (result.data === undefined) {
    throw new Error(customerWarrantyError(result.error, 'Không thể mở bảo hành này.'));
  }
  return result.data.data;
}

export async function listWarrantyPolicies(
  client: WarrantyApiClient,
  query: WarrantyPolicyQuery,
): Promise<WarrantyPage<WarrantyPolicy>> {
  const params = {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.q === undefined || query.q === '' ? {} : { q: query.q }),
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
    ...(query.archived === undefined || query.archived === ''
      ? {}
      : { archived: query.archived === 'true' }),
  };
  const result = await client.GET('/api/v1/backoffice/warranty-policies', {
    params: { query: params },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể tải chính sách bảo hành.'));
  }
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function getWarrantyPolicy(
  client: WarrantyApiClient,
  id: string,
): Promise<WarrantyPolicy> {
  const result = await client.GET('/api/v1/backoffice/warranty-policies/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể mở chính sách bảo hành.'));
  }
  return result.data.data;
}

export async function createWarrantyPolicy(
  client: WarrantyApiClient,
  input: CreateWarrantyPolicyInput,
): Promise<WarrantyPolicy> {
  const result = await client.POST('/api/v1/backoffice/warranty-policies', { body: input });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể tạo chính sách bảo hành.'));
  }
  return result.data.data;
}

export async function updateWarrantyPolicy(
  client: WarrantyApiClient,
  id: string,
  input: UpdateWarrantyPolicyInput,
): Promise<WarrantyPolicy> {
  const result = await client.PATCH('/api/v1/backoffice/warranty-policies/{id}', {
    params: { path: { id } },
    body: input,
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể cập nhật chính sách bảo hành.'));
  }
  return result.data.data;
}

export function activateWarrantyPolicy(client: WarrantyApiClient, id: string) {
  return runPolicyCommand(client, id, 'activate');
}

export function deactivateWarrantyPolicy(client: WarrantyApiClient, id: string, reason: string) {
  return runPolicyCommand(client, id, 'deactivate', { reason });
}

export function archiveWarrantyPolicy(client: WarrantyApiClient, id: string, reason: string) {
  return runPolicyCommand(client, id, 'archive', { reason });
}

export async function listBackofficeWarranties(
  client: WarrantyApiClient,
  query: BackofficeWarrantyQuery,
): Promise<WarrantyPage<BackofficeWarrantyListItem>> {
  const params = {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.q === undefined || query.q === '' ? {} : { q: query.q }),
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
    ...(query.validity === undefined || query.validity === '' ? {} : { validity: query.validity }),
    ...(query.customerId === undefined || query.customerId === ''
      ? {}
      : { customerId: query.customerId }),
  };
  const result = await client.GET('/api/v1/backoffice/warranties', {
    params: { query: params },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể tải danh sách bảo hành.'));
  }
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function getBackofficeWarranty(
  client: WarrantyApiClient,
  id: string,
): Promise<BackofficeWarrantyDetail> {
  const result = await client.GET('/api/v1/backoffice/warranties/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể mở chi tiết bảo hành.'));
  }
  return result.data.data;
}

export async function voidWarranty(
  client: WarrantyApiClient,
  id: string,
  reason: string,
): Promise<BackofficeWarrantyDetail> {
  const result = await client.POST('/api/v1/backoffice/warranties/{id}/void', {
    params: { path: { id } },
    body: { reason },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể vô hiệu bảo hành.'));
  }
  return result.data.data;
}

export function warrantyError(value: unknown, fallback: string): string {
  return mappedWarrantyError(value, fallback, apiError);
}

export function customerWarrantyError(value: unknown, fallback: string): string {
  return mappedWarrantyError(value, fallback, customerApiError);
}

function mappedWarrantyError(
  value: unknown,
  fallback: string,
  defaultError: (value: unknown, fallback: string) => string,
): string {
  const code = errorCode(value);
  if (code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy bảo hành hoặc bạn không có quyền xem.';
  if (code === 'DUPLICATE_RESOURCE') return 'Mã chính sách đã tồn tại.';
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Dữ liệu đã đổi trạng thái hoặc còn liên kết đang hoạt động. Hãy tải lại.';
  }
  if (code === 'CONCURRENT_MODIFICATION') return 'Dữ liệu vừa được cập nhật. Hãy tải lại trang.';
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  return defaultError(value, fallback);
}

async function runPolicyCommand(
  client: WarrantyApiClient,
  id: string,
  command: 'activate' | 'deactivate' | 'archive',
  body?: { reason: string },
): Promise<WarrantyPolicy> {
  const result =
    command === 'activate'
      ? await client.POST('/api/v1/backoffice/warranty-policies/{id}/activate', {
          params: { path: { id } },
        })
      : command === 'deactivate'
        ? await client.POST('/api/v1/backoffice/warranty-policies/{id}/deactivate', {
            params: { path: { id } },
            body: body ?? { reason: '' },
          })
        : await client.POST('/api/v1/backoffice/warranty-policies/{id}/archive', {
            params: { path: { id } },
            body: body ?? { reason: '' },
          });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể đổi trạng thái chính sách.'));
  }
  return result.data.data;
}

function pageFrom<T>(items: T[], meta: unknown, fallback: CustomerWarrantyQuery): WarrantyPage<T> {
  const source = isRecord(meta) && isRecord(meta['pagination']) ? meta['pagination'] : meta;
  const pagination = isRecord(source) ? source : {};
  return {
    data: items,
    pagination: {
      page: numberOr(pagination['page'], fallback.page),
      pageSize: numberOr(pagination['pageSize'], fallback.pageSize),
      totalItems: numberOr(pagination['totalItems'], items.length),
      totalPages: numberOr(pagination['totalPages'], items.length === 0 ? 0 : 1),
    },
  };
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
