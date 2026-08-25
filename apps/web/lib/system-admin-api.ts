import { type components, type createApiClient } from '@rephone/api-client';
import { apiError } from './order-access';

export type SystemApiClient = ReturnType<typeof createApiClient>;
export type Employee = components['schemas']['EmployeeDetailDto'];
export type EmployeeCreateResult = components['schemas']['EmployeeCreateResultDto'];
export type Customer = components['schemas']['CustomerDetailDto'];
export type StoreSettings = components['schemas']['StoreSettingsDto'];
export type AuditLogListItem = components['schemas']['AuditLogListItemDto'];
export type AuditLogDetail = components['schemas']['AuditLogDetailDto'];
export type UpdateSettingsInput = components['schemas']['UpdateStoreSettingsDto'];

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

export interface EmployeeQuery {
  q?: string;
  status?: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  hiredFrom?: string;
  hiredTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface CustomerQuery {
  q?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'lastLoginAt';
  sortOrder: 'asc' | 'desc';
}

export interface AuditQuery {
  actorUserId?: string;
  actorType?: 'USER' | 'GUEST' | 'SYSTEM';
  action?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export async function listEmployees(
  client: SystemApiClient,
  query: EmployeeQuery,
): Promise<Page<Employee>> {
  const result = await client.GET('/api/v1/backoffice/employees', {
    params: { query: compact(query) },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể tải nhân viên.');
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function createEmployee(
  client: SystemApiClient,
  input: {
    email: string;
    fullName: string;
    phone?: string;
    employeeCode: string;
    hiredAt?: string;
  },
): Promise<EmployeeCreateResult> {
  const result = await client.POST('/api/v1/backoffice/employees', { body: input });
  if (result.data === undefined) throw systemError(result.error, 'Không thể tạo nhân viên.');
  return result.data.data;
}

export async function getEmployee(client: SystemApiClient, id: string): Promise<Employee> {
  const result = await client.GET('/api/v1/backoffice/employees/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể mở nhân viên.');
  return result.data.data;
}

export async function updateEmployee(
  client: SystemApiClient,
  id: string,
  input: {
    fullName?: string;
    phone?: string | null;
    employeeCode?: string;
    hiredAt?: string | null;
  },
): Promise<Employee> {
  const result = await client.PATCH('/api/v1/backoffice/employees/{id}', {
    params: { path: { id } },
    body: input,
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể cập nhật nhân viên.');
  return result.data.data;
}

export async function resendInvitation(
  client: SystemApiClient,
  id: string,
): Promise<'SENT' | 'FAILED'> {
  const result = await client.POST('/api/v1/backoffice/employees/{id}/resend-invitation', {
    params: { path: { id } },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể gửi lại lời mời.');
  return result.data.data.deliveryStatus;
}

export function disableEmployee(client: SystemApiClient, id: string, reason: string) {
  return employeeLifecycle(client, id, 'disable', reason);
}

export function enableEmployee(client: SystemApiClient, id: string, reason: string) {
  return employeeLifecycle(client, id, 'enable', reason);
}

export async function listCustomers(
  client: SystemApiClient,
  query: CustomerQuery,
): Promise<Page<Customer>> {
  const result = await client.GET('/api/v1/backoffice/customers', {
    params: { query: compact(query) },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể tải khách hàng.');
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function getCustomer(client: SystemApiClient, id: string): Promise<Customer> {
  const result = await client.GET('/api/v1/backoffice/customers/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể mở khách hàng.');
  return result.data.data;
}

export function suspendCustomer(client: SystemApiClient, id: string, reason: string) {
  return customerLifecycle(client, id, 'suspend', reason);
}

export function activateCustomer(client: SystemApiClient, id: string, reason: string) {
  return customerLifecycle(client, id, 'activate', reason);
}

export async function getSettings(client: SystemApiClient): Promise<StoreSettings> {
  const result = await client.GET('/api/v1/backoffice/settings');
  if (result.data === undefined) throw systemError(result.error, 'Không thể tải cấu hình.');
  return result.data.data;
}

export async function updateSettings(
  client: SystemApiClient,
  input: UpdateSettingsInput,
): Promise<StoreSettings> {
  const result = await client.PATCH('/api/v1/backoffice/settings', { body: input });
  if (result.data === undefined) throw systemError(result.error, 'Không thể cập nhật cấu hình.');
  return result.data.data;
}

export async function uploadBankQr(
  client: unknown,
  expectedVersion: number,
  file: File,
): Promise<StoreSettings> {
  const form = new FormData();
  form.set('expectedVersion', String(expectedVersion));
  form.set('file', file);
  const result = await runtimeClient(client).POST('/api/v1/backoffice/settings/bank-qr', {
    body: { expectedVersion, file: file.name },
    bodySerializer: () => form,
  });
  const envelope = result.data;
  if (!isRecord(envelope) || !isRecord(envelope['data'])) {
    throw systemError(result.error, 'Không thể tải QR ngân hàng.');
  }
  return envelope['data'] as StoreSettings;
}

export async function listAuditLogs(
  client: SystemApiClient,
  query: AuditQuery,
): Promise<Page<AuditLogListItem>> {
  const result = await client.GET('/api/v1/backoffice/audit-logs', {
    params: { query: compact(query) },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể tải audit log.');
  return pageFrom(result.data.data, result.data.meta, query);
}

export async function getAuditLog(client: SystemApiClient, id: string): Promise<AuditLogDetail> {
  const result = await client.GET('/api/v1/backoffice/audit-logs/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) throw systemError(result.error, 'Không thể mở audit log.');
  return result.data.data;
}

export function systemError(value: unknown, fallback: string): Error {
  const code = errorCode(value);
  if (code === 'SETTINGS_VERSION_CONFLICT') {
    return new Error('Cấu hình vừa được thay đổi ở phiên khác. Hãy tải lại trước khi lưu.');
  }
  if (code === 'DUPLICATE_RESOURCE') return new Error('Email hoặc mã nhân viên đã tồn tại.');
  if (code === 'INVALID_STATE_TRANSITION') {
    return new Error('Tài khoản đã đổi trạng thái. Hãy tải lại dữ liệu mới nhất.');
  }
  if (code === 'RESOURCE_NOT_FOUND') return new Error('Không tìm thấy dữ liệu yêu cầu.');
  if (code === 'RATE_LIMITED') return new Error('Bạn thao tác quá nhanh. Vui lòng thử lại sau.');
  if (code === 'FILE_TOO_LARGE') return new Error('Tệp QR vượt quá 5 MiB.');
  if (code === 'UNSUPPORTED_FILE_TYPE') return new Error('QR chỉ hỗ trợ JPEG, PNG hoặc WebP.');
  return new Error(apiError(value, fallback));
}

async function employeeLifecycle(
  client: SystemApiClient,
  id: string,
  command: 'disable' | 'enable',
  reason: string,
): Promise<Employee> {
  const result =
    command === 'disable'
      ? await client.POST('/api/v1/backoffice/employees/{id}/disable', {
          params: { path: { id } },
          body: { reason },
        })
      : await client.POST('/api/v1/backoffice/employees/{id}/enable', {
          params: { path: { id } },
          body: { reason },
        });
  if (result.data === undefined) throw systemError(result.error, 'Không thể đổi trạng thái.');
  return result.data.data;
}

async function customerLifecycle(
  client: SystemApiClient,
  id: string,
  command: 'suspend' | 'activate',
  reason: string,
): Promise<Customer> {
  const result =
    command === 'suspend'
      ? await client.POST('/api/v1/backoffice/customers/{id}/suspend', {
          params: { path: { id } },
          body: { reason },
        })
      : await client.POST('/api/v1/backoffice/customers/{id}/activate', {
          params: { path: { id } },
          body: { reason },
        });
  if (result.data === undefined) throw systemError(result.error, 'Không thể đổi trạng thái.');
  return result.data.data;
}

function pageFrom<T>(
  items: T[],
  meta: unknown,
  fallback: { page: number; pageSize: number },
): Page<T> {
  const source = isRecord(meta) && isRecord(meta['pagination']) ? meta['pagination'] : {};
  return {
    data: items,
    pagination: {
      page: numberOr(source['page'], fallback.page),
      pageSize: numberOr(source['pageSize'], fallback.pageSize),
      totalItems: numberOr(source['totalItems'], items.length),
      totalPages: numberOr(source['totalPages'], items.length === 0 ? 0 : 1),
    },
  };
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  ) as T;
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface RuntimeResult {
  data?: unknown;
  error?: unknown;
}

interface RuntimeClient {
  POST(path: string, options?: unknown): Promise<RuntimeResult>;
}

function runtimeClient(value: unknown): RuntimeClient {
  return value as RuntimeClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
