import { apiError } from './order-access';

export type RefundStatus = 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type RefundMethod = 'BANK_TRANSFER' | 'CASH' | 'OTHER';
export type RefundRequesterType = 'CUSTOMER' | 'STAFF' | 'SYSTEM';
export type RefundAction =
  | 'START_PROCESSING'
  | 'COMPLETE_BANK_TRANSFER'
  | 'COMPLETE_CASH'
  | 'REJECT'
  | 'CANCEL'
  | 'VIEW_EVIDENCE';

export interface RefundActorSummary {
  id: string;
  fullName: string;
  employeeCode: string | null;
}

export interface RefundListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: string;
  method: RefundMethod;
  status: RefundStatus;
  reason: string;
  requesterType: RefundRequesterType;
  requester: RefundActorSummary | null;
  createdAt: string;
  processingAt: string | null;
  completedAt: string | null;
  terminalAt: string | null;
  evidenceAvailable: boolean;
}

export interface RefundPaymentSummary {
  id: string;
  purpose: string;
  method: string;
  status: string;
  expectedAmount: string;
  receivedAmount: string | null;
}

export interface RefundOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  fulfillmentType: string;
  contactName: string | null;
  paidAmount: string;
  refundedAmount: string;
  refundableAmount: string | null;
}

export interface RefundTimelineItem {
  label: string;
  at: string;
}

export interface RefundDetail extends RefundListItem {
  note: string | null;
  terminalReason: string | null;
  processor: RefundActorSummary | null;
  terminalActor: RefundActorSummary | null;
  payment: RefundPaymentSummary | null;
  order: RefundOrderSummary;
  timeline: RefundTimelineItem[];
  availableActions: RefundAction[];
}

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

interface RuntimeApiResult {
  data?: unknown;
  error?: unknown;
}

interface RuntimeApiClient {
  GET(path: string, options?: unknown): Promise<RuntimeApiResult>;
  POST(path: string, options?: unknown): Promise<RuntimeApiResult>;
}

export async function listBackofficeRefunds(
  client: unknown,
  query: RefundListQuery,
): Promise<RefundListResult> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/refunds', {
    params: { query: compactQuery(query) },
  });
  const envelope = responseEnvelope(result, 'Không thể tải hàng chờ hoàn tiền.');
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
  return parseDetail(responseData(result, 'Không thể tải chi tiết hoàn tiền.'));
}

export async function createRefund(
  client: unknown,
  orderId: string,
  input: {
    paymentId?: string;
    amount: string;
    method: Exclude<RefundMethod, 'OTHER'>;
    reason: string;
  },
): Promise<RefundDetail> {
  const result = await runtimeClient(client).POST('/api/v1/backoffice/orders/{id}/refunds', {
    params: { path: { id: orderId } },
    body: input,
  });
  return parseDetail(responseData(result, 'Không thể tạo yêu cầu hoàn tiền.'));
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
  return parseDetail(responseData(result, 'Không thể hoàn tất chuyển khoản hoàn tiền.'));
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
): Promise<{ url: string; expiresAt: string | null }> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/refunds/{id}/evidence-url', {
    params: { path: { id: refundId } },
  });
  const data = recordOrThrow(
    responseData(result, 'Không thể mở minh chứng hoàn tiền.'),
    'Phản hồi signed URL không hợp lệ.',
  );
  const url = stringOrNull(data['url']);
  if (url === null || !isSafeHttpUrl(url)) {
    throw new Error('Phản hồi signed URL không hợp lệ.');
  }
  return { url, expiresAt: stringOrNull(data['expiresAt']) };
}

export function refundError(value: unknown, fallback: string): string {
  const code = errorCode(value);
  if (code === 'REFUND_AMOUNT_EXCEEDS_PAID') {
    return 'Số tiền hoàn vượt quá khoản đã thu còn có thể hoàn.';
  }
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Yêu cầu hoàn tiền không còn ở trạng thái cho phép. Hãy tải lại.';
  }
  if (code === 'CONCURRENT_MODIFICATION') {
    return 'Dữ liệu vừa được xử lý ở phiên khác. Hãy tải lại.';
  }
  if (code === 'EVIDENCE_REQUIRED' || code === 'EVIDENCE_INVALID') {
    return 'Minh chứng hoàn tiền không hợp lệ hoặc đã hỏng.';
  }
  if (code === 'FILE_TOO_LARGE') return 'Tệp vượt quá giới hạn 10 MiB.';
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Chỉ nhận JPEG, PNG, WebP hoặc PDF hợp lệ.';
  if (code === 'STORAGE_UNAVAILABLE') return 'Kho minh chứng tạm thời không sẵn sàng.';
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
  return parseDetail(responseData(result, fallback));
}

function parseListItem(value: unknown): RefundListItem {
  const input = recordOrThrow(value, 'Dữ liệu hoàn tiền không hợp lệ.');
  const refund = isRecord(input['refund']) ? input['refund'] : input;
  const order = recordOrEmpty(input['order'] ?? refund['order']);
  const requester = parseActor(input['requester'] ?? refund['requestedBy']);
  return {
    id: stringOr(refund['id']),
    orderId: stringOrNull(refund['orderId']) ?? stringOr(order['id']),
    orderNumber: stringOrNull(refund['orderNumber']) ?? stringOrNull(order['orderNumber']) ?? '—',
    amount: moneyOrZero(refund['amount']),
    method: refundMethod(refund['method']),
    status: refundStatus(refund['status']),
    reason: stringOr(refund['reason']),
    requesterType: requesterType(refund['requestedByType'] ?? refund['requesterType']),
    requester,
    createdAt: stringOr(refund['createdAt']),
    processingAt: stringOrNull(refund['processingAt']),
    completedAt: stringOrNull(refund['completedAt']),
    terminalAt: stringOrNull(refund['terminalAt']),
    evidenceAvailable: input['evidenceAvailable'] === true || refund['evidenceAvailable'] === true,
  };
}

function parseDetail(value: unknown): RefundDetail {
  const input = recordOrThrow(value, 'Dữ liệu chi tiết hoàn tiền không hợp lệ.');
  const refund = isRecord(input['refund']) ? input['refund'] : input;
  const base = parseListItem(input);
  const order = recordOrEmpty(input['order'] ?? refund['order']);
  const pricing = recordOrEmpty(order['pricing']);
  const payment = parsePayment(input['payment'] ?? refund['payment']);
  return {
    ...base,
    note: stringOrNull(refund['note']),
    terminalReason: stringOrNull(refund['terminalReason']),
    processor: parseActor(input['processor'] ?? refund['processedBy']),
    terminalActor: parseActor(input['terminalActor'] ?? refund['terminalBy']),
    payment,
    order: {
      id: stringOrNull(order['id']) ?? base.orderId,
      orderNumber: stringOrNull(order['orderNumber']) ?? base.orderNumber,
      status: stringOr(order['status']),
      fulfillmentStatus: stringOr(order['fulfillmentStatus']),
      paymentStatus: stringOr(order['paymentStatus']),
      fulfillmentType: stringOr(order['fulfillmentType']),
      contactName:
        stringOrNull(order['customerName']) ??
        stringOrNull(recordOrEmpty(order['contact'])['fullName']),
      paidAmount: moneyFrom(order, pricing, 'paidAmount'),
      refundedAmount: moneyFrom(order, pricing, 'refundedAmount'),
      refundableAmount:
        moneyOrNull(order['refundableAmount']) ?? moneyOrNull(pricing['refundableAmount']),
    },
    timeline: parseTimeline(input['timeline'], refund),
    availableActions: refundActions(input['availableActions'] ?? refund['availableActions']),
  };
}

function parsePayment(value: unknown): RefundPaymentSummary | null {
  if (!isRecord(value)) return null;
  const id = stringOrNull(value['id']);
  if (id === null) return null;
  return {
    id,
    purpose: stringOr(value['purpose']),
    method: stringOr(value['method']),
    status: stringOr(value['status']),
    expectedAmount: moneyOrZero(value['expectedAmount']),
    receivedAmount: moneyOrNull(value['receivedAmount']),
  };
}

function parseActor(value: unknown): RefundActorSummary | null {
  if (!isRecord(value)) return null;
  const id = stringOrNull(value['id']);
  const fullName = stringOrNull(value['fullName']);
  if (id === null || fullName === null) return null;
  return { id, fullName, employeeCode: stringOrNull(value['employeeCode']) };
}

function parseTimeline(value: unknown, refund: Record<string, unknown>): RefundTimelineItem[] {
  if (Array.isArray(value)) {
    return value.flatMap((row) => {
      if (!isRecord(row)) return [];
      const label = stringOrNull(row['label']);
      const at = stringOrNull(row['at']);
      return label === null || at === null ? [] : [{ label, at }];
    });
  }
  const terminalLabel =
    refundStatus(refund['status']) === 'REJECTED' ? 'Đã từ chối' : 'Đã hủy yêu cầu';
  const candidates: Array<[string, unknown]> = [
    ['Đã tạo yêu cầu', refund['createdAt']],
    ['Bắt đầu xử lý', refund['processingAt']],
    ['Hoàn tất', refund['completedAt']],
    [terminalLabel, refund['terminalAt']],
  ];
  return candidates.flatMap(([label, at]) => {
    const timestamp = stringOrNull(at);
    return timestamp === null ? [] : [{ label, at: timestamp }];
  });
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
  return value === 'BANK_TRANSFER' || value === 'CASH' ? value : 'OTHER';
}

function refundStatus(value: unknown): RefundStatus {
  if (
    value === 'PROCESSING' ||
    value === 'COMPLETED' ||
    value === 'REJECTED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return 'REQUESTED';
}

function requesterType(value: unknown): RefundRequesterType {
  return value === 'STAFF' || value === 'SYSTEM' ? value : 'CUSTOMER';
}

function moneyFrom(
  direct: Record<string, unknown>,
  nested: Record<string, unknown>,
  key: string,
): string {
  return moneyOrNull(direct[key]) ?? moneyOrZero(nested[key]);
}

function moneyOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}

function moneyOrZero(value: unknown): string {
  return moneyOrNull(value) ?? '0';
}

function stringOr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
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
