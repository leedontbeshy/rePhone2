import { type components, type createApiClient } from '@rephone/api-client';
import {
  apiError,
  customerApiError,
  readGuestOrderToken,
  removeGuestOrderToken,
} from './order-access';

export type WarrantyApiClient = ReturnType<typeof createApiClient>;
export type WarrantyListItem = components['schemas']['WarrantyListItemDto'];
export type WarrantyDetail = components['schemas']['WarrantyDetailDto'];
export type WarrantyPolicy = components['schemas']['WarrantyPolicyDto'];
export type BackofficeWarrantyPolicyDetail =
  components['schemas']['BackofficeWarrantyPolicyDetailDto'];
export type BackofficeWarrantyListItem = components['schemas']['BackofficeWarrantyListItemDto'];
export type BackofficeWarrantyDetail = components['schemas']['BackofficeWarrantyDetailDto'];
export type BackofficeWarrantyAction = BackofficeWarrantyDetail['availableActions'][number];
export type BackofficeWarrantyPolicyAction =
  BackofficeWarrantyPolicyDetail['availableActions'][number];
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

export type WarrantyCustomerErrorKind =
  'conflict' | 'not-found' | 'provider' | 'rate-limit' | 'unknown';

export class WarrantyCustomerError extends Error {
  public constructor(
    message: string,
    public readonly kind: WarrantyCustomerErrorKind,
  ) {
    super(message);
    this.name = 'WarrantyCustomerError';
  }
}

const ORDER_NUMBER_PATTERN = /^RPH-\d{8}-[A-Z0-9]{8}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
  if (result.data === undefined) {
    throw customerWarrantyFailure(result.error, 'Không thể tải bảo hành.');
  }
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
    throw customerWarrantyFailure(result.error, 'Không thể mở bảo hành này.');
  }
  return result.data.data;
}

export function resolveWarrantyGuestCredential(
  authStatus: 'anonymous' | 'authenticated' | 'loading',
  orderNumber: string | null | undefined,
  storage: Pick<Storage, 'getItem'>,
): string | undefined {
  if (authStatus !== 'anonymous' || orderNumber === null || orderNumber === undefined) {
    return undefined;
  }
  const normalized = orderNumber.trim().toUpperCase();
  if (!ORDER_NUMBER_PATTERN.test(normalized)) return undefined;
  const token = readGuestOrderToken(normalized, storage);
  return token !== undefined && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function clearWarrantyGuestCredential(
  orderNumber: string | null | undefined,
  storage: Pick<Storage, 'removeItem'>,
): void {
  if (orderNumber === null || orderNumber === undefined) return;
  const normalized = orderNumber.trim().toUpperCase();
  if (!ORDER_NUMBER_PATTERN.test(normalized)) return;
  removeGuestOrderToken(normalized, storage);
}

export function warrantyAccessKey(
  authStatus: 'anonymous' | 'authenticated' | 'loading',
  userId: string | null | undefined,
  orderNumber: string | null | undefined,
  warrantyCode: string,
): string {
  return JSON.stringify([authStatus, userId ?? '', orderNumber ?? '', warrantyCode]);
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
  return pageFrom(
    arrayOrThrow(result.data.data, 'Dữ liệu danh sách chính sách không hợp lệ.').map(
      parseWarrantyPolicy,
    ),
    result.data.meta,
    query,
  );
}

export async function getWarrantyPolicy(
  client: WarrantyApiClient,
  id: string,
): Promise<BackofficeWarrantyPolicyDetail> {
  const result = await client.GET('/api/v1/backoffice/warranty-policies/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể mở chính sách bảo hành.'));
  }
  return parseBackofficeWarrantyPolicyDetail(result.data.data);
}

export async function createWarrantyPolicy(
  client: WarrantyApiClient,
  input: CreateWarrantyPolicyInput,
): Promise<WarrantyPolicy> {
  const result = await client.POST('/api/v1/backoffice/warranty-policies', { body: input });
  if (result.data === undefined) {
    throw new Error(warrantyError(result.error, 'Không thể tạo chính sách bảo hành.'));
  }
  return parseWarrantyPolicy(result.data.data);
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
  return parseWarrantyPolicy(result.data.data);
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
  return pageFrom(
    arrayOrThrow(result.data.data, 'Dữ liệu danh sách bảo hành không hợp lệ.').map(
      parseBackofficeWarrantyListItem,
    ),
    result.data.meta,
    query,
  );
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
  return parseBackofficeWarrantyDetail(result.data.data);
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
  return parseBackofficeWarrantyDetail(result.data.data);
}

export function warrantyError(value: unknown, fallback: string): string {
  return mappedWarrantyError(value, fallback, apiError);
}

export function customerWarrantyError(value: unknown, fallback: string): string {
  return mappedWarrantyError(value, fallback, customerApiError);
}

function customerWarrantyFailure(value: unknown, fallback: string): WarrantyCustomerError {
  const code = errorCode(value);
  const kind: WarrantyCustomerErrorKind =
    code === 'ORDER_NOT_FOUND' || code === 'RESOURCE_NOT_FOUND'
      ? 'not-found'
      : code === 'CONCURRENT_MODIFICATION' || code === 'INVALID_STATE_TRANSITION'
        ? 'conflict'
        : code === 'RATE_LIMITED'
          ? 'rate-limit'
          : code === 'STORAGE_UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE'
            ? 'provider'
            : 'unknown';
  return new WarrantyCustomerError(
    kind === 'not-found'
      ? 'Không tìm thấy thông tin hoặc bạn không có quyền truy cập.'
      : customerWarrantyError(value, fallback),
    kind,
  );
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
  return parseWarrantyPolicy(result.data.data);
}

function parseWarrantyPolicy(value: unknown): WarrantyPolicy {
  const input = recordOrThrow(value, 'Dữ liệu chính sách bảo hành không hợp lệ.');
  const status = input['status'];
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    throw new Error('Dữ liệu chính sách bảo hành không hợp lệ.');
  }
  return {
    archivedAt: nullableString(input['archivedAt']),
    code: requiredString(input['code'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    createdAt: requiredString(input['createdAt'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    defaultDays: requiredNumber(input['defaultDays'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    id: requiredString(input['id'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    isArchived: requiredBoolean(input['isArchived'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    name: requiredString(input['name'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    status,
    terms: requiredString(input['terms'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
    updatedAt: requiredString(input['updatedAt'], 'Dữ liệu chính sách bảo hành không hợp lệ.'),
  };
}

function parseBackofficeWarrantyPolicyDetail(value: unknown): BackofficeWarrantyPolicyDetail {
  const input = recordOrThrow(value, 'Dữ liệu chi tiết chính sách không hợp lệ.');
  const archiveBlockedReason = input['archiveBlockedReason'];
  if (archiveBlockedReason !== null && archiveBlockedReason !== 'ACTIVE_CATALOG_REFERENCES') {
    throw new Error('Dữ liệu chi tiết chính sách không hợp lệ.');
  }
  return {
    ...parseWarrantyPolicy(input),
    archiveBlockedReason,
    availableActions: warrantyPolicyActions(input['availableActions']),
  };
}

function parseBackofficeWarrantyListItem(value: unknown): BackofficeWarrantyListItem {
  const input = recordOrThrow(value, 'Dữ liệu bảo hành không hợp lệ.');
  const status = input['status'];
  if (status !== 'ACTIVE' && status !== 'VOIDED') {
    throw new Error('Dữ liệu bảo hành không hợp lệ.');
  }
  return {
    createdAt: requiredString(input['createdAt'], 'Dữ liệu bảo hành không hợp lệ.'),
    customer: parseWarrantyCustomer(input['customer']),
    daysSnapshot: requiredNumber(input['daysSnapshot'], 'Dữ liệu bảo hành không hợp lệ.'),
    endAt: requiredString(input['endAt'], 'Dữ liệu bảo hành không hợp lệ.'),
    id: requiredString(input['id'], 'Dữ liệu bảo hành không hợp lệ.'),
    inventoryCode: nullableString(input['inventoryCode']),
    isExpired: requiredBoolean(input['isExpired'], 'Dữ liệu bảo hành không hợp lệ.'),
    isValid: requiredBoolean(input['isValid'], 'Dữ liệu bảo hành không hợp lệ.'),
    orderItemId: requiredString(input['orderItemId'], 'Dữ liệu bảo hành không hợp lệ.'),
    orderNumber: requiredString(input['orderNumber'], 'Dữ liệu bảo hành không hợp lệ.'),
    policy: parseWarrantyPolicySummary(input['policy']),
    productName: requiredString(input['productName'], 'Dữ liệu bảo hành không hợp lệ.'),
    startAt: requiredString(input['startAt'], 'Dữ liệu bảo hành không hợp lệ.'),
    status,
    variantName: requiredString(input['variantName'], 'Dữ liệu bảo hành không hợp lệ.'),
    warrantyCode: requiredString(input['warrantyCode'], 'Dữ liệu bảo hành không hợp lệ.'),
  };
}

function parseBackofficeWarrantyDetail(value: unknown): BackofficeWarrantyDetail {
  const input = recordOrThrow(value, 'Dữ liệu chi tiết bảo hành không hợp lệ.');
  return {
    ...parseBackofficeWarrantyListItem(input),
    availableActions: warrantyActions(input['availableActions']),
    maskedIdentifierSuffix: nullableString(input['maskedIdentifierSuffix']),
    sku: requiredString(input['sku'], 'Dữ liệu chi tiết bảo hành không hợp lệ.'),
    termsSnapshot: requiredString(
      input['termsSnapshot'],
      'Dữ liệu chi tiết bảo hành không hợp lệ.',
    ),
    updatedAt: requiredString(input['updatedAt'], 'Dữ liệu chi tiết bảo hành không hợp lệ.'),
    voidedAt: nullableString(input['voidedAt']),
    voidedBy: parseWarrantyActor(input['voidedBy']),
    voidReason: nullableString(input['voidReason']),
  };
}

function parseWarrantyCustomer(
  value: unknown,
): components['schemas']['WarrantyCustomerSummaryDto'] {
  const input = recordOrThrow(value, 'Dữ liệu khách hàng trong bảo hành không hợp lệ.');
  return {
    customerId: nullableString(input['customerId']),
    email: requiredString(input['email'], 'Dữ liệu khách hàng trong bảo hành không hợp lệ.'),
    name: requiredString(input['name'], 'Dữ liệu khách hàng trong bảo hành không hợp lệ.'),
    phone: requiredString(input['phone'], 'Dữ liệu khách hàng trong bảo hành không hợp lệ.'),
  };
}

function parseWarrantyPolicySummary(
  value: unknown,
): components['schemas']['WarrantyPolicySummaryDto'] | null {
  if (value === null || value === undefined) return null;
  const input = recordOrThrow(value, 'Dữ liệu chính sách trong bảo hành không hợp lệ.');
  return {
    code: requiredString(input['code'], 'Dữ liệu chính sách trong bảo hành không hợp lệ.'),
    id: requiredString(input['id'], 'Dữ liệu chính sách trong bảo hành không hợp lệ.'),
    name: requiredString(input['name'], 'Dữ liệu chính sách trong bảo hành không hợp lệ.'),
  };
}

function parseWarrantyActor(
  value: unknown,
): components['schemas']['WarrantyActorSummaryDto'] | null {
  if (value === null || value === undefined) return null;
  const input = recordOrThrow(value, 'Dữ liệu người thực hiện không hợp lệ.');
  return {
    fullName: requiredString(input['fullName'], 'Dữ liệu người thực hiện không hợp lệ.'),
    id: requiredString(input['id'], 'Dữ liệu người thực hiện không hợp lệ.'),
  };
}

function warrantyActions(value: unknown): BackofficeWarrantyAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is BackofficeWarrantyAction => candidate === 'VOID');
}

function warrantyPolicyActions(value: unknown): BackofficeWarrantyPolicyAction[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<BackofficeWarrantyPolicyAction>([
    'EDIT',
    'ACTIVATE',
    'DEACTIVATE',
    'ARCHIVE',
  ]);
  return value.filter(
    (candidate): candidate is BackofficeWarrantyPolicyAction =>
      typeof candidate === 'string' && allowed.has(candidate as BackofficeWarrantyPolicyAction),
  );
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

function arrayOrThrow(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function recordOrThrow(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message);
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Dữ liệu bảo hành không hợp lệ.');
  return value;
}

function requiredNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(message);
  return value;
}

function requiredBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
