import type { components } from '@rephone/api-client';
import { assertSafeEvidenceUrl } from './evidence-url';
import { apiError } from './order-access';

export type RefundStatus = components['schemas']['RefundListItemDto']['status'];
export type RefundMethod = components['schemas']['RefundListItemDto']['method'];
export type RefundRequesterType = components['schemas']['RefundListItemDto']['requestedByType'];
export type RefundAction = components['schemas']['RefundDetailDto']['availableActions'][number];
export type RefundActorSummary = components['schemas']['RefundActorDto'];
export type RefundListItem = components['schemas']['RefundListItemDto'];
export type RefundPaymentSummary = components['schemas']['RefundPaymentSourceDto'];
export type RefundOrderSummary = components['schemas']['RefundOrderSummaryDto'];
export type RefundDetail = components['schemas']['RefundDetailDto'];

export interface RefundListQuery {
  status?: RefundStatus | '';
  method?: RefundMethod | '';
  orderNumber?: string;
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'amount' | 'processingAt';
  sortOrder: 'asc' | 'desc';
}

export interface RefundListResult {
  data: RefundListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateRefundInput {
  paymentId?: string;
  amount: string;
  method: Exclude<RefundMethod, 'OTHER'>;
  reason: string;
}

export interface RefundIntentKeyStore {
  clear(): void;
  keyFor(orderId: string, input: CreateRefundInput): string;
}

export const REFUND_EVIDENCE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const REFUND_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export class RefundCommandError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'RefundCommandError';
  }

  public get requiresRefetch(): boolean {
    return this.code === 'INVALID_STATE_TRANSITION' || this.code === 'CONCURRENT_MODIFICATION';
  }
}

interface RuntimeApiResult {
  data?: unknown;
  error?: unknown;
}

interface RuntimeApiClient {
  GET(path: string, options?: unknown): Promise<RuntimeApiResult>;
  POST(path: string, options?: unknown): Promise<RuntimeApiResult>;
}

export function validateRefundEvidenceFile(file: File): string | null {
  if (file.size === 0) return 'Tệp minh chứng đang trống.';
  if (file.size > REFUND_EVIDENCE_MAX_BYTES) return 'Tệp vượt quá giới hạn 10 MB.';
  if (!(REFUND_EVIDENCE_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ nhận tệp JPEG, PNG, WebP hoặc PDF.';
  }
  return null;
}

export function shouldRefetchRefund(value: unknown): boolean {
  return value instanceof RefundCommandError && value.requiresRefetch;
}

export async function listBackofficeRefunds(
  client: unknown,
  query: RefundListQuery,
): Promise<RefundListResult> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/refunds', {
    params: { query: compactQuery(query) },
  });
  const envelope = responseEnvelope(result, 'Không thể tải danh sách hoàn tiền.');
  const rows = Array.isArray(envelope['data']) ? envelope['data'] : [];
  const pagination = recordOrEmpty(recordOrEmpty(envelope['meta'])['pagination']);
  return {
    data: rows.map(parseListItem),
    pagination: {
      page: numberOr(pagination['page'], query.page),
      pageSize: numberOr(pagination['pageSize'], query.pageSize),
      totalItems: numberOr(pagination['totalItems'], rows.length),
      totalPages: numberOr(pagination['totalPages'], rows.length === 0 ? 0 : 1),
    },
  };
}

export async function getBackofficeRefund(
  client: unknown,
  refundId: string,
): Promise<RefundDetail> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/refunds/{id}', {
    params: { path: { id: refundId } },
  });
  return parseDetail(responseData(result, 'Không thể tải hồ sơ hoàn tiền.'));
}

export async function createRefund(
  client: unknown,
  orderId: string,
  input: CreateRefundInput,
  idempotencyKey: string,
): Promise<RefundDetail> {
  const result = await runtimeClient(client).POST('/api/v1/backoffice/orders/{id}/refunds', {
    params: {
      path: { id: orderId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
  });
  return commandData(result, 'Không thể tạo yêu cầu hoàn tiền.');
}

export function createRefundIntentKeyStore(
  generateKey: () => string = () => crypto.randomUUID(),
): RefundIntentKeyStore {
  let current: { signature: string; key: string } | null = null;
  return {
    clear() {
      current = null;
    },
    keyFor(orderId, input) {
      const signature = JSON.stringify([
        orderId,
        input.paymentId ?? null,
        input.amount,
        input.method,
        input.reason,
      ]);
      if (current?.signature === signature) return current.key;
      const key = generateKey();
      current = { signature, key };
      return key;
    },
  };
}

export function startRefundProcessing(client: unknown, refundId: string, note?: string) {
  return runJsonCommand(
    client,
    refundId,
    'start-processing',
    note === undefined ? {} : { note },
    'Không thể bắt đầu xử lý hoàn tiền.',
  );
}

export function completeCashRefund(client: unknown, refundId: string, note: string) {
  return runJsonCommand(
    client,
    refundId,
    'complete-cash',
    { note },
    'Không thể hoàn tất hoàn tiền mặt.',
  );
}

export async function completeBankTransferRefund(
  client: unknown,
  refundId: string,
  file: File,
  note: string,
): Promise<RefundDetail> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('note', note);
  const result = await runtimeClient(client).POST(
    '/api/v1/backoffice/refunds/{id}/complete-bank-transfer',
    {
      params: { path: { id: refundId } },
      body: { file, note },
      bodySerializer: () => formData,
    },
  );
  return commandData(result, 'Không thể hoàn tất chuyển khoản hoàn tiền.');
}

export function rejectRefund(client: unknown, refundId: string, reason: string) {
  return runJsonCommand(
    client,
    refundId,
    'reject',
    { reason },
    'Không thể từ chối yêu cầu hoàn tiền.',
  );
}

export function cancelRefund(client: unknown, refundId: string, reason: string) {
  return runJsonCommand(client, refundId, 'cancel', { reason }, 'Không thể hủy yêu cầu hoàn tiền.');
}

export async function getRefundEvidenceUrl(
  client: unknown,
  refundId: string,
): Promise<{ url: string; expiresAt: string }> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/refunds/{id}/evidence-url', {
    params: { path: { id: refundId } },
  });
  const data = recordOrThrow(
    responseData(result, 'Không thể mở minh chứng hoàn tiền.'),
    'Không thể mở minh chứng lúc này.',
  );
  const url = requiredString(data['url'], 'Không thể mở minh chứng lúc này.');
  assertSafeEvidenceUrl(url);
  return {
    url,
    expiresAt: requiredString(data['expiresAt'], 'Không thể mở minh chứng lúc này.'),
  };
}

export function refundError(value: unknown, fallback: string): string {
  const code = errorCode(value);
  if (code === 'REFUND_AMOUNT_EXCEEDS_PAID') {
    return 'Số tiền hoàn vượt quá khoản đã thu của đơn hàng.';
  }
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Yêu cầu đã chuyển sang bước khác. Hồ sơ mới nhất đang được tải lại.';
  }
  if (code === 'CONCURRENT_MODIFICATION') {
    return 'Hồ sơ vừa được người khác cập nhật. Dữ liệu mới nhất đang được tải lại.';
  }
  if (code === 'EVIDENCE_REQUIRED' || code === 'EVIDENCE_INVALID') {
    return 'Minh chứng hoàn tiền không hợp lệ. Hãy chọn lại tệp.';
  }
  if (code === 'FILE_TOO_LARGE') return 'Tệp vượt quá giới hạn 10 MB.';
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Chỉ nhận tệp JPEG, PNG, WebP hoặc PDF.';
  if (code === 'STORAGE_UNAVAILABLE') return 'Hiện chưa thể lưu minh chứng. Vui lòng thử lại sau.';
  if (code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy yêu cầu hoàn tiền.';
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  return apiError(value, fallback);
}

async function runJsonCommand(
  client: unknown,
  refundId: string,
  command: 'start-processing' | 'complete-cash' | 'reject' | 'cancel',
  body: unknown,
  fallback: string,
): Promise<RefundDetail> {
  const result = await runtimeClient(client).POST(`/api/v1/backoffice/refunds/{id}/${command}`, {
    params: { path: { id: refundId } },
    body,
  });
  return commandData(result, fallback);
}

function commandData(result: RuntimeApiResult, fallback: string): RefundDetail {
  if (result.data === undefined) {
    throw new RefundCommandError(refundError(result.error, fallback), errorCode(result.error));
  }
  return parseDetail(responseData(result, fallback));
}

function parseListItem(value: unknown): RefundListItem {
  const input = recordOrThrow(value, 'Dữ liệu hoàn tiền không hợp lệ.');
  return {
    id: requiredString(input['id'], 'Dữ liệu hoàn tiền không hợp lệ.'),
    orderNumber: requiredString(input['orderNumber'], 'Dữ liệu hoàn tiền không hợp lệ.'),
    amount: money(input['amount']),
    method: refundMethod(input['method']),
    status: refundStatus(input['status']),
    requestedByType: requesterType(input['requestedByType']),
    requester: parseActor(input['requester']),
    evidenceAvailable: input['evidenceAvailable'] === true,
    processingAt: optionalString(input['processingAt']),
    completedAt: optionalString(input['completedAt']),
    terminalAt: optionalString(input['terminalAt']),
    createdAt: requiredString(input['createdAt'], 'Dữ liệu hoàn tiền không hợp lệ.'),
  };
}

function parseDetail(value: unknown): RefundDetail {
  const input = recordOrThrow(value, 'Dữ liệu hồ sơ hoàn tiền không hợp lệ.');
  const base = parseListItem(input);
  const order = recordOrThrow(input['order'], 'Dữ liệu đơn hàng không hợp lệ.');
  return {
    ...base,
    reason: requiredString(input['reason'], 'Dữ liệu hồ sơ hoàn tiền không hợp lệ.'),
    note: optionalString(input['note']),
    processor: parseActor(input['processor']),
    terminalActor: parseActor(input['terminalActor']),
    terminalReason: optionalString(input['terminalReason']),
    availableActions: refundActions(input['availableActions']),
    payment: parsePayment(input['payment']),
    order: {
      id: requiredString(order['id'], 'Dữ liệu đơn hàng không hợp lệ.'),
      orderNumber: requiredString(order['orderNumber'], 'Dữ liệu đơn hàng không hợp lệ.'),
      status: requiredString(order['status'], 'Dữ liệu đơn hàng không hợp lệ.'),
      fulfillmentStatus: requiredString(
        order['fulfillmentStatus'],
        'Dữ liệu đơn hàng không hợp lệ.',
      ),
      paymentStatus: requiredString(order['paymentStatus'], 'Dữ liệu đơn hàng không hợp lệ.'),
      customerName: requiredString(order['customerName'], 'Dữ liệu đơn hàng không hợp lệ.'),
      customerEmail: requiredString(order['customerEmail'], 'Dữ liệu đơn hàng không hợp lệ.'),
      grandTotal: money(order['grandTotal']),
      paidAmount: money(order['paidAmount']),
      refundedAmount: money(order['refundedAmount']),
      balanceDue: money(order['balanceDue']),
    },
  };
}

function parsePayment(value: unknown): RefundPaymentSummary | null {
  if (value === null || value === undefined) return null;
  const input = recordOrThrow(value, 'Dữ liệu khoản thanh toán không hợp lệ.');
  const purpose = input['purpose'];
  const method = input['method'];
  if (purpose !== 'DEPOSIT' && purpose !== 'BALANCE' && purpose !== 'FULL_PAYMENT') {
    throw new Error('Dữ liệu khoản thanh toán không hợp lệ.');
  }
  if (method !== 'BANK_TRANSFER' && method !== 'CASH' && method !== 'COD' && method !== 'OTHER') {
    throw new Error('Dữ liệu khoản thanh toán không hợp lệ.');
  }
  return {
    id: requiredString(input['id'], 'Dữ liệu khoản thanh toán không hợp lệ.'),
    purpose,
    method,
    status: requiredString(input['status'], 'Dữ liệu khoản thanh toán không hợp lệ.'),
    expectedAmount: money(input['expectedAmount']),
    receivedAmount: optionalMoney(input['receivedAmount']),
  };
}

function parseActor(value: unknown): RefundActorSummary | null {
  if (value === null || value === undefined) return null;
  const input = recordOrThrow(value, 'Dữ liệu người xử lý không hợp lệ.');
  return {
    id: requiredString(input['id'], 'Dữ liệu người xử lý không hợp lệ.'),
    fullName: requiredString(input['fullName'], 'Dữ liệu người xử lý không hợp lệ.'),
    employeeCode: optionalString(input['employeeCode']),
  };
}

function refundActions(value: unknown): RefundAction[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<RefundAction>([
    'START_PROCESSING',
    'COMPLETE_BANK_TRANSFER',
    'COMPLETE_CASH',
    'REJECT',
    'CANCEL',
    'VIEW_EVIDENCE',
  ]);
  return value.filter(
    (candidate): candidate is RefundAction =>
      typeof candidate === 'string' && allowed.has(candidate as RefundAction),
  );
}

function compactQuery(query: RefundListQuery): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== '' && value !== undefined),
  );
}

function responseData(result: RuntimeApiResult, fallback: string): unknown {
  const envelope = responseEnvelope(result, fallback);
  if (!('data' in envelope)) throw new Error(fallback);
  return envelope['data'];
}

function responseEnvelope(result: RuntimeApiResult, fallback: string): Record<string, unknown> {
  if (result.data === undefined) throw new Error(refundError(result.error, fallback));
  return recordOrThrow(result.data, fallback);
}

function runtimeClient(client: unknown): RuntimeApiClient {
  return client as RuntimeApiClient;
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function refundMethod(value: unknown): RefundMethod {
  if (value === 'BANK_TRANSFER' || value === 'CASH' || value === 'OTHER') return value;
  throw new Error('Dữ liệu phương thức hoàn tiền không hợp lệ.');
}

function refundStatus(value: unknown): RefundStatus {
  if (
    value === 'REQUESTED' ||
    value === 'PROCESSING' ||
    value === 'COMPLETED' ||
    value === 'REJECTED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  throw new Error('Dữ liệu trạng thái hoàn tiền không hợp lệ.');
}

function requesterType(value: unknown): RefundRequesterType {
  if (value === 'CUSTOMER' || value === 'STAFF' || value === 'SYSTEM') return value;
  throw new Error('Dữ liệu người yêu cầu không hợp lệ.');
}

function money(value: unknown): string {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  throw new Error('Dữ liệu số tiền không hợp lệ.');
}

function optionalMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return money(value);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function recordOrThrow(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
