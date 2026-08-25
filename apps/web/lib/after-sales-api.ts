import { type components, type createApiClient } from '@rephone/api-client';
import { apiError, orderTokenStorageKey } from './order-access';

export type AfterSalesApiClient = ReturnType<typeof createApiClient>;
export type AfterSalesType = components['schemas']['AfterSalesDetailDto']['type'];
export type AfterSalesStatus = components['schemas']['AfterSalesDetailDto']['status'];
export type AfterSalesListItem = components['schemas']['AfterSalesListItemDto'];
export type AfterSalesDetail = components['schemas']['AfterSalesDetailDto'];
export type AfterSalesAttachment = components['schemas']['AfterSalesAttachmentDto'];
export type CreateAfterSalesInput = components['schemas']['CreateAfterSalesRequestDto'];

export interface AfterSalesListQuery {
  type?: AfterSalesType | '';
  status?: AfterSalesStatus | '';
  page: number;
  pageSize: number;
}

export interface AfterSalesPage {
  data: AfterSalesListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AfterSalesAttachmentCollection {
  requestNumber: string;
  attachments: AfterSalesAttachment[];
}

const ORDER_NUMBER_PATTERN = /^RPH-\d{8}-[A-Z0-9]{8}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export async function listCustomerAfterSalesRequests(
  client: AfterSalesApiClient,
  query: AfterSalesListQuery,
): Promise<AfterSalesPage> {
  const params = {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.type === undefined || query.type === '' ? {} : { type: query.type }),
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
  };
  const result = await client.GET('/api/v1/after-sales', { params: { query: params } });
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, 'Không thể tải yêu cầu hậu mãi.'));
  }
  return {
    data: result.data.data,
    pagination: result.data.meta.pagination,
  };
}

export async function createAfterSalesRequest(
  client: AfterSalesApiClient,
  input: CreateAfterSalesInput,
  guestOrderToken?: string,
): Promise<AfterSalesDetail> {
  const result = await client.POST('/api/v1/after-sales', {
    params: { header: mutationHeaders(guestOrderToken) },
    body: input,
  });
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, 'Không thể tạo yêu cầu hậu mãi.'));
  }
  return result.data.data;
}

export async function getAfterSalesRequest(
  client: AfterSalesApiClient,
  requestNumber: string,
  guestOrderToken?: string,
): Promise<AfterSalesDetail> {
  const result = await client.GET('/api/v1/after-sales/{requestNumber}', {
    params: {
      path: { requestNumber },
      header: credentialHeader(guestOrderToken),
    },
  });
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, 'Không thể mở yêu cầu hậu mãi.'));
  }
  return result.data.data;
}

export async function uploadAfterSalesAttachment(
  client: unknown,
  requestNumber: string,
  file: File,
  guestOrderToken?: string,
): Promise<AfterSalesAttachmentCollection> {
  const formData = new FormData();
  formData.set('file', file);
  const result = await runtimeClient(client).POST(
    '/api/v1/after-sales/{requestNumber}/attachments',
    {
      params: {
        path: { requestNumber },
        header: mutationHeaders(guestOrderToken),
      },
      body: { file: file.name },
      bodySerializer: () => formData,
    },
  );
  return responseData(result, 'Không thể tải tệp đính kèm lên.') as AfterSalesAttachmentCollection;
}

export async function getAfterSalesAttachmentUrl(
  client: AfterSalesApiClient,
  requestNumber: string,
  attachmentId: string,
  guestOrderToken?: string,
): Promise<{ url: string; expiresAt: string }> {
  const result = await client.GET(
    '/api/v1/after-sales/{requestNumber}/attachments/{attachmentId}/url',
    {
      params: {
        path: { requestNumber, attachmentId },
        header: credentialHeader(guestOrderToken),
      },
    },
  );
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, 'Không thể mở tệp đính kèm.'));
  }
  if (!isSafeSignedUrl(result.data.data.url)) {
    throw new Error('Phản hồi signed URL không hợp lệ.');
  }
  return result.data.data;
}

export async function cancelAfterSalesRequest(
  client: AfterSalesApiClient,
  requestNumber: string,
  reason: string,
  guestOrderToken?: string,
): Promise<AfterSalesDetail> {
  const result = await client.POST('/api/v1/after-sales/{requestNumber}/cancel', {
    params: {
      path: { requestNumber },
      header: mutationHeaders(guestOrderToken),
    },
    body: { reason },
  });
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, 'Không thể hủy yêu cầu hậu mãi.'));
  }
  return result.data.data;
}

export function resolveGuestOrderToken(
  orderNumber: string | null | undefined,
  storage: Pick<Storage, 'getItem'>,
): string | undefined {
  if (orderNumber === null || orderNumber === undefined) return undefined;
  const normalized = orderNumber.trim().toUpperCase();
  if (!ORDER_NUMBER_PATTERN.test(normalized)) return undefined;
  const token = storage.getItem(orderTokenStorageKey(normalized)) ?? undefined;
  return token !== undefined && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function validateAfterSalesAttachment(file: File): string | null {
  if (file.size === 0) return 'Tệp đính kèm đang trống.';
  if (file.size > MAX_ATTACHMENT_SIZE) return 'Tệp vượt quá giới hạn 10 MiB.';
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return 'Chỉ nhận JPEG, PNG, WebP hoặc PDF.';
  }
  return null;
}

export function afterSalesError(value: unknown, fallback: string): string {
  const code = errorCode(value);
  if (code === 'AFTER_SALES_REQUEST_ALREADY_OPEN') {
    return 'Sản phẩm này đã có một yêu cầu hậu mãi đang mở.';
  }
  if (code === 'WARRANTY_NOT_ACTIVE') {
    return 'Bảo hành không còn hiệu lực tại thời điểm tạo yêu cầu.';
  }
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Yêu cầu đã đổi trạng thái ở phiên khác. Hãy tải lại.';
  }
  if (code === 'CONCURRENT_MODIFICATION') {
    return 'Dữ liệu vừa được cập nhật ở phiên khác. Hãy tải lại.';
  }
  if (code === 'EVIDENCE_REQUIRED' || code === 'EVIDENCE_INVALID') {
    return 'Tệp đính kèm không hợp lệ hoặc đã hỏng.';
  }
  if (code === 'FILE_TOO_LARGE') return 'Tệp vượt quá giới hạn 10 MiB.';
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Chỉ nhận JPEG, PNG, WebP hoặc PDF hợp lệ.';
  if (code === 'STORAGE_UNAVAILABLE') return 'Kho tệp tạm thời không sẵn sàng.';
  if (code === 'RESOURCE_NOT_FOUND' || code === 'ORDER_NOT_FOUND') {
    return 'Không tìm thấy yêu cầu hoặc bạn không có quyền truy cập.';
  }
  if (code === 'CSRF_VALIDATION_FAILED') {
    return 'Phiên guest không hợp lệ. Hãy mở lại đơn hàng rồi thử lại.';
  }
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  return apiError(value, fallback);
}

function credentialHeader(guestOrderToken?: string): { 'X-Guest-Order-Token'?: string } {
  return guestOrderToken === undefined ? {} : { 'X-Guest-Order-Token': guestOrderToken };
}

function mutationHeaders(guestOrderToken?: string): {
  'X-Rephone-CSRF': string;
  'X-Guest-Order-Token'?: string;
} {
  return {
    'X-Rephone-CSRF': '1',
    ...credentialHeader(guestOrderToken),
  };
}

function isSafeSignedUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.username !== '' || parsed.password !== '') return false;
    if (parsed.protocol === 'https:') return true;
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

interface RuntimeApiResult {
  data?: unknown;
  error?: unknown;
}

interface RuntimeApiClient {
  POST(path: string, options?: unknown): Promise<RuntimeApiResult>;
}

function runtimeClient(client: unknown): RuntimeApiClient {
  return client as RuntimeApiClient;
}

function responseData(result: RuntimeApiResult, fallback: string): unknown {
  if (result.data === undefined) {
    throw new Error(afterSalesError(result.error, fallback));
  }
  if (!isRecord(result.data) || !('data' in result.data)) throw new Error(fallback);
  return result.data['data'];
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
