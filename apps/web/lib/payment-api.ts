import { apiError, customerApiError } from './order-access';

export type PaymentStatus =
  'AWAITING_PROOF' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentPublic {
  id: string;
  orderNumber: string;
  purpose: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT';
  method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
  status: PaymentStatus;
  expectedAmount: string;
  receivedAmount: string | null;
  transferContent: string | null;
  bankTransferInstructions: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    qrUrl: string | null;
    transferContent: string;
  } | null;
  expiresAt: string | null;
  submittedAt: string | null;
  reviewSlaDueAt: string | null;
  reviewOverdue: boolean;
  rejectionReason: string | null;
}

export interface PaymentQueueItem extends PaymentPublic {
  createdAt: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface BackofficeOrderSummary {
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  grandTotal: string | null;
  depositRequired: string | null;
  paidAmount: string | null;
  refundedAmount: string | null;
  balanceDue: string | null;
  contact: {
    fullName: string;
    email: string;
    phone: string;
  } | null;
  items: Array<{
    id: string;
    productName: string;
    variantName: string;
    quantity: number;
    lineTotal: string;
  }>;
}

export interface PaymentTimelineItem {
  label: string;
  at: string;
}

export interface BackofficePaymentDetail {
  payment: PaymentPublic;
  order: BackofficeOrderSummary;
  evidenceAvailable: boolean;
  reviewer: { id: string; fullName: string } | null;
  timeline: PaymentTimelineItem[];
}

export interface ReviewPaymentResult {
  payment: PaymentPublic;
  order: BackofficeOrderSummary;
  notificationDelivery: 'SENT' | 'FAILED' | 'SKIPPED_REPLAY';
}

export interface PaymentListQuery {
  status?: PaymentStatus | '';
  purpose?: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | '';
  method?: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER' | '';
  reviewOverdue?: boolean;
  orderNumber?: string;
  submittedFrom?: string;
  submittedTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'submittedAt' | 'expiresAt' | 'createdAt' | 'expectedAmount';
  sortOrder: 'asc' | 'desc';
}

export interface PaymentListResult {
  data: PaymentQueueItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export type CustomerPaymentErrorCode = string;

export class CustomerPaymentError extends Error {
  public constructor(
    message: string,
    public readonly code: CustomerPaymentErrorCode | undefined,
  ) {
    super(message);
    this.name = 'CustomerPaymentError';
  }

  public get requiresOrderRefetch(): boolean {
    return (
      this.code === 'PAYMENT_PROOF_DEADLINE_PASSED' ||
      this.code === 'PAYMENT_ALREADY_REVIEWED' ||
      this.code === 'INVALID_STATE_TRANSITION' ||
      this.code === 'CONCURRENT_MODIFICATION'
    );
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

export async function submitPaymentProof(
  client: unknown,
  paymentId: string,
  file: File,
  guestOrderToken?: string,
): Promise<PaymentPublic> {
  const formData = new FormData();
  formData.set('file', file);
  const result = await runtimeClient(client).POST('/api/v1/payments/{paymentId}/submit-proof', {
    params: {
      path: { paymentId },
      header: {
        'X-Rephone-CSRF': '1',
        ...(guestOrderToken === undefined ? {} : { 'X-Guest-Order-Token': guestOrderToken }),
      },
    },
    body: { file },
    bodySerializer: () => formData,
  });
  if (result.data === undefined) {
    throw new CustomerPaymentError(
      customerPaymentError(result.error, 'Không thể nộp minh chứng thanh toán.'),
      errorCode(result.error),
    );
  }
  return parsePayment(responseData(result, 'Không thể nộp minh chứng thanh toán.'));
}

export const CUSTOMER_PAYMENT_PROOF_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const CUSTOMER_PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export function validateCustomerPaymentProof(file: File): string | null {
  if (file.size === 0) return 'Tệp minh chứng đang trống.';
  if (file.size > CUSTOMER_PAYMENT_PROOF_MAX_BYTES) return 'Tệp vượt quá giới hạn 10 MB.';
  if (!(CUSTOMER_PAYMENT_PROOF_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ nhận tệp JPEG, PNG, WebP hoặc PDF.';
  }
  return null;
}

export async function listBackofficePayments(
  client: unknown,
  query: PaymentListQuery,
): Promise<PaymentListResult> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/payments', {
    params: { query: compactQuery(query) },
  });
  const envelope = responseEnvelope(result, 'Không thể tải hàng chờ thanh toán.');
  const rows = Array.isArray(envelope['data']) ? envelope['data'] : [];
  const meta = recordOrEmpty(envelope['meta']);
  const pagination = recordOrEmpty(meta['pagination']);
  return {
    data: rows.map(parseQueueItem),
    pagination: {
      page: numberOr(pagination['page'], query.page),
      pageSize: numberOr(pagination['pageSize'], query.pageSize),
      totalItems: numberOr(pagination['totalItems'], rows.length),
      totalPages: numberOr(pagination['totalPages'], rows.length === 0 ? 0 : 1),
    },
  };
}

export async function getBackofficePayment(
  client: unknown,
  paymentId: string,
): Promise<BackofficePaymentDetail> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/payments/{id}', {
    params: { path: { id: paymentId } },
  });
  return parseBackofficeDetail(responseData(result, 'Không thể tải chi tiết thanh toán.'));
}

export async function getPaymentEvidenceUrl(
  client: unknown,
  paymentId: string,
): Promise<{ url: string; expiresAt: string | null }> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/payments/{id}/evidence-url', {
    params: { path: { id: paymentId } },
  });
  const data = recordOrThrow(
    responseData(result, 'Không thể mở minh chứng thanh toán.'),
    'Phản hồi signed URL không hợp lệ.',
  );
  const url = stringOrNull(data['url']);
  if (url === null) throw new Error('Phản hồi signed URL không hợp lệ.');
  assertSafeHttpUrl(url);
  return { url, expiresAt: stringOrNull(data['expiresAt']) };
}

export async function verifyPayment(
  client: unknown,
  paymentId: string,
  body: { receivedAmount: string; note?: string },
): Promise<ReviewPaymentResult> {
  const result = await runtimeClient(client).POST('/api/v1/backoffice/payments/{id}/verify', {
    params: { path: { id: paymentId } },
    body,
  });
  return parseReviewResult(responseData(result, 'Không thể xác minh thanh toán.'));
}

export async function rejectPayment(
  client: unknown,
  paymentId: string,
  body: { reason: string },
): Promise<ReviewPaymentResult> {
  const result = await runtimeClient(client).POST('/api/v1/backoffice/payments/{id}/reject', {
    params: { path: { id: paymentId } },
    body,
  });
  return parseReviewResult(responseData(result, 'Không thể từ chối thanh toán.'));
}

export function paymentError(value: unknown, fallback: string): string {
  return mappedPaymentError(value, fallback, apiError);
}

export function customerPaymentError(value: unknown, fallback: string): string {
  return mappedPaymentError(value, fallback, customerApiError);
}

function mappedPaymentError(
  value: unknown,
  fallback: string,
  defaultError: (value: unknown, fallback: string) => string,
): string {
  const code = errorCode(value);
  if (code === 'PAYMENT_PROOF_DEADLINE_PASSED') return 'Đã quá hạn nộp minh chứng thanh toán.';
  if (code === 'PAYMENT_ALREADY_REVIEWED') return 'Thanh toán đã được xử lý. Hãy tải lại trang.';
  if (code === 'DEPOSIT_AMOUNT_INSUFFICIENT') return 'Số tiền nhận được chưa đủ mức cọc.';
  if (code === 'EVIDENCE_REQUIRED') return 'Thanh toán chưa có minh chứng hợp lệ.';
  if (code === 'EVIDENCE_INVALID') return 'Minh chứng không hợp lệ hoặc đã hỏng.';
  if (code === 'FILE_TOO_LARGE') return 'Tệp vượt quá giới hạn 10 MB.';
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Chỉ nhận JPEG, PNG, WebP hoặc PDF hợp lệ.';
  if (code === 'STORAGE_UNAVAILABLE') return 'Hiện chưa thể lưu tệp. Vui lòng thử lại sau.';
  if (code === 'CONCURRENT_MODIFICATION') return 'Dữ liệu vừa được cập nhật. Hãy tải lại trang.';
  if (code === 'ORDER_NOT_FOUND')
    return 'Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập.';
  return defaultError(value, fallback);
}

type PaymentErrorMapper = (value: unknown, fallback: string) => string;

function responseData(
  result: RuntimeApiResult,
  fallback: string,
  errorMapper: PaymentErrorMapper = paymentError,
): unknown {
  const envelope = responseEnvelope(result, fallback, errorMapper);
  if (!('data' in envelope)) throw new Error(fallback);
  return envelope['data'];
}

function responseEnvelope(
  result: RuntimeApiResult,
  fallback: string,
  errorMapper: PaymentErrorMapper = paymentError,
): Record<string, unknown> {
  if (result.data === undefined) throw new Error(errorMapper(result.error, fallback));
  return recordOrThrow(result.data, fallback);
}

function parsePayment(value: unknown): PaymentPublic {
  const input = recordOrThrow(value, 'Dữ liệu thanh toán không hợp lệ.');
  const instructions = isRecord(input['bankTransferInstructions'])
    ? input['bankTransferInstructions']
    : null;
  return {
    id: stringOr(input['id']),
    orderNumber: stringOr(input['orderNumber']),
    purpose: paymentPurpose(input['purpose']),
    method: paymentMethod(input['method']),
    status: paymentStatus(input['status']),
    expectedAmount: moneyOrZero(input['expectedAmount']),
    receivedAmount: moneyOrNull(input['receivedAmount']),
    transferContent:
      stringOrNull(input['transferContent']) ??
      (instructions === null ? null : stringOrNull(instructions['transferContent'])),
    bankTransferInstructions:
      instructions === null
        ? legacyInstructions(input)
        : {
            bankName: stringOr(instructions['bankName']),
            accountNumber: stringOr(instructions['accountNumber']),
            accountHolder: stringOr(instructions['accountHolder']),
            qrUrl: stringOrNull(instructions['qrUrl']),
            transferContent: stringOr(instructions['transferContent']),
          },
    expiresAt: stringOrNull(input['expiresAt']),
    submittedAt: stringOrNull(input['submittedAt']),
    reviewSlaDueAt: stringOrNull(input['reviewSlaDueAt']),
    reviewOverdue: input['reviewOverdue'] === true,
    rejectionReason: stringOrNull(input['rejectionReason']),
  };
}

function legacyInstructions(
  input: Record<string, unknown>,
): PaymentPublic['bankTransferInstructions'] {
  const bankName = stringOrNull(input['bankName']);
  const accountNumber = stringOrNull(input['bankAccountNumber']);
  const accountHolder = stringOrNull(input['bankAccountHolder']);
  if (bankName === null || accountNumber === null || accountHolder === null) return null;
  return {
    bankName,
    accountNumber,
    accountHolder,
    qrUrl: stringOrNull(input['bankQrUrl']),
    transferContent: stringOr(input['transferContent']),
  };
}

function parseQueueItem(value: unknown): PaymentQueueItem {
  const input = recordOrThrow(value, 'Dữ liệu hàng chờ không hợp lệ.');
  const paymentRecord = isRecord(input['payment']) ? input['payment'] : input;
  const order = recordOrEmpty(input['order']);
  const contact = recordOrEmpty(order['contact']);
  const payment = parsePayment({
    ...paymentRecord,
    orderNumber:
      stringOrNull(paymentRecord['orderNumber']) ?? stringOrNull(order['orderNumber']) ?? '',
  });
  return {
    ...payment,
    createdAt: stringOrNull(paymentRecord['createdAt']),
    contactName:
      stringOrNull(input['customerName']) ??
      stringOrNull(input['contactName']) ??
      stringOrNull(contact['fullName']),
    contactEmail:
      stringOrNull(input['customerEmail']) ??
      stringOrNull(input['contactEmail']) ??
      stringOrNull(contact['email']),
  };
}

function parseBackofficeDetail(value: unknown): BackofficePaymentDetail {
  const input = recordOrThrow(value, 'Dữ liệu chi tiết thanh toán không hợp lệ.');
  const paymentRecord = isRecord(input['payment']) ? input['payment'] : input;
  const orderRecord = recordOrEmpty(input['order']);
  const payment = parsePayment({
    ...paymentRecord,
    orderNumber:
      stringOrNull(paymentRecord['orderNumber']) ?? stringOrNull(orderRecord['orderNumber']) ?? '',
  });
  return {
    payment,
    order: parseOrderSummary(orderRecord, payment.orderNumber),
    evidenceAvailable:
      input['evidenceAvailable'] === true || paymentRecord['evidenceAvailable'] === true,
    reviewer: parseReviewer(input['reviewer']),
    timeline: parseTimeline(input['timeline'], {
      ...paymentRecord,
      reviewedAt: input['reviewedAt'],
    }),
  };
}

function parseReviewResult(value: unknown): ReviewPaymentResult {
  const input = recordOrThrow(value, 'Dữ liệu kết quả review không hợp lệ.');
  const payment = parsePayment(input['payment']);
  const delivery = input['notificationDelivery'];
  return {
    payment,
    order: parseOrderSummary(input['order'], payment.orderNumber),
    notificationDelivery:
      delivery === 'SENT' || delivery === 'FAILED' || delivery === 'SKIPPED_REPLAY'
        ? delivery
        : 'FAILED',
  };
}

function parseOrderSummary(value: unknown, fallbackOrderNumber: string): BackofficeOrderSummary {
  const input = recordOrEmpty(value);
  const pricing = recordOrEmpty(input['pricing']);
  const contact = isRecord(input['contact'])
    ? {
        fullName: stringOr(input['contact']['fullName']),
        email: stringOr(input['contact']['email']),
        phone: stringOr(input['contact']['phone']),
      }
    : stringOrNull(input['customerName']) === null
      ? null
      : {
          fullName: stringOr(input['customerName']),
          email: stringOr(input['customerEmail']),
          phone: stringOr(input['customerPhone']),
        };
  const rows = Array.isArray(input['items']) ? input['items'] : [];
  return {
    orderNumber: stringOrNull(input['orderNumber']) ?? fallbackOrderNumber,
    status: stringOr(input['status']),
    fulfillmentStatus: stringOr(input['fulfillmentStatus']),
    paymentStatus: stringOr(input['paymentStatus']),
    grandTotal: moneyOrNull(input['grandTotal']) ?? moneyOrNull(pricing['grandTotal']),
    depositRequired:
      moneyOrNull(input['depositRequired']) ?? moneyOrNull(pricing['depositRequired']),
    paidAmount: moneyOrNull(input['paidAmount']) ?? moneyOrNull(pricing['paidAmount']),
    refundedAmount: moneyOrNull(input['refundedAmount']) ?? moneyOrNull(pricing['refundedAmount']),
    balanceDue: moneyOrNull(input['balanceDue']) ?? moneyOrNull(pricing['balanceDue']),
    contact,
    items: rows.map((row, index) => {
      const item = recordOrEmpty(row);
      return {
        id: stringOrNull(item['id']) ?? String(index),
        productName: stringOr(item['productName']),
        variantName: stringOr(item['variantName']),
        quantity: numberOr(item['quantity'], 0),
        lineTotal: moneyOrZero(item['lineTotal']),
      };
    }),
  };
}

function parseReviewer(value: unknown): BackofficePaymentDetail['reviewer'] {
  if (!isRecord(value)) return null;
  const id = stringOrNull(value['id']);
  const fullName = stringOrNull(value['fullName']);
  return id === null || fullName === null ? null : { id, fullName };
}

function parseTimeline(value: unknown, payment: Record<string, unknown>): PaymentTimelineItem[] {
  if (Array.isArray(value)) {
    return value.flatMap((row) => {
      if (!isRecord(row)) return [];
      const label = stringOrNull(row['label']);
      const at = stringOrNull(row['at']);
      return label === null || at === null ? [] : [{ label, at }];
    });
  }
  const candidates: Array<[string, unknown]> = [
    ['Được tạo', payment['createdAt']],
    ['Đã nộp minh chứng', payment['submittedAt']],
    ['Đã review', payment['reviewedAt']],
  ];
  return candidates.flatMap(([label, at]) => {
    const parsed = stringOrNull(at);
    return parsed === null ? [] : [{ label, at: parsed }];
  });
}

function compactQuery(query: PaymentListQuery): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== '' && value !== undefined),
  );
}

function runtimeClient(client: unknown): RuntimeApiClient {
  return client as RuntimeApiClient;
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function paymentPurpose(value: unknown): PaymentPublic['purpose'] {
  return value === 'BALANCE' || value === 'FULL_PAYMENT' ? value : 'DEPOSIT';
}

function paymentMethod(value: unknown): PaymentPublic['method'] {
  return value === 'CASH' || value === 'COD' || value === 'OTHER' ? value : 'BANK_TRANSFER';
}

function paymentStatus(value: unknown): PaymentStatus {
  if (
    value === 'UNDER_REVIEW' ||
    value === 'VERIFIED' ||
    value === 'REJECTED' ||
    value === 'EXPIRED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return 'AWAITING_PROOF';
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

function assertSafeHttpUrl(value: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return;
  } catch {
    // Handled by the stable public error below.
  }
  throw new Error('Phản hồi signed URL không hợp lệ.');
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
