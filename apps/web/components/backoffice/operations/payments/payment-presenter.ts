import type { PaymentListQuery, PaymentStatus, PaymentPublic } from '@/lib/payment-api';
import type { OperationsTone } from '../operations-primitives';

export interface PaymentPresentation {
  readonly label: string;
  readonly tone: OperationsTone;
}

export const PAYMENT_DEFAULT_QUERY: PaymentListQuery = {
  status: 'UNDER_REVIEW',
  purpose: '',
  method: '',
  page: 1,
  pageSize: 20,
  sortBy: 'submittedAt',
  sortOrder: 'asc',
};

export function paymentStatusPresentation(status: PaymentStatus): PaymentPresentation {
  if (status === 'UNDER_REVIEW') return { label: 'Chờ kiểm tra', tone: 'warning' };
  if (status === 'AWAITING_PROOF') return { label: 'Chờ minh chứng', tone: 'info' };
  if (status === 'VERIFIED') return { label: 'Đã xác nhận', tone: 'success' };
  if (status === 'REJECTED') return { label: 'Đã từ chối', tone: 'danger' };
  if (status === 'EXPIRED') return { label: 'Đã hết hạn', tone: 'neutral' };
  return { label: 'Đã hủy', tone: 'neutral' };
}

export function paymentPurposeLabel(purpose: PaymentPublic['purpose']): string {
  if (purpose === 'DEPOSIT') return 'Đặt cọc';
  if (purpose === 'BALANCE') return 'Thanh toán phần còn lại';
  return 'Thanh toán toàn bộ';
}

export function paymentMethodLabel(method: PaymentPublic['method']): string {
  if (method === 'BANK_TRANSFER') return 'Chuyển khoản';
  if (method === 'CASH') return 'Tiền mặt';
  if (method === 'COD') return 'Thanh toán khi nhận hàng';
  return 'Phương thức khác';
}

export function paymentOrderStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    PLACED: 'Đã đặt hàng',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang xử lý',
    COMPLETED: 'Đã hoàn tất',
    CANCELLED: 'Đã hủy',
  };
  return labels[value] ?? 'Đang cập nhật';
}

export function paymentFulfillmentStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Chưa bắt đầu',
    PREPARING: 'Đang chuẩn bị',
    READY: 'Sẵn sàng bàn giao',
    READY_FOR_PICKUP: 'Sẵn sàng nhận máy',
    IN_TRANSIT: 'Đang giao hàng',
    COMPLETED: 'Đã hoàn tất giao nhận',
    DELIVERED: 'Đã giao hàng',
    PICKED_UP: 'Đã nhận tại cửa hàng',
    FAILED: 'Giao hàng chưa thành công',
    RETURNED: 'Đã hoàn về',
    CANCELLED: 'Đã hủy',
  };
  return labels[value] ?? 'Đang cập nhật';
}

export function paymentOrderPaymentStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    UNPAID: 'Chưa thanh toán',
    DEPOSIT_PENDING: 'Chờ xác nhận cọc',
    PARTIALLY_PAID: 'Đã thanh toán một phần',
    PAID: 'Đã thanh toán đủ',
    REFUND_PENDING: 'Đang hoàn tiền',
    PARTIALLY_REFUNDED: 'Đã hoàn một phần',
    REFUNDED: 'Đã hoàn tiền',
  };
  return labels[value] ?? 'Đang cập nhật';
}

export function paymentDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return 'Chưa có';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}

export function paymentQueryFromSearch(search: URLSearchParams): PaymentListQuery {
  const rawStatus = search.get('status');
  const status = paymentStatus(rawStatus);
  const purpose = paymentPurpose(search.get('purpose'));
  const method = paymentMethod(search.get('method'));
  const reviewOverdue = search.get('reviewOverdue');
  const orderNumber = search.get('orderNumber')?.trim().slice(0, 64);
  const submittedFrom = validDate(search.get('submittedFrom'));
  const submittedTo = validDate(search.get('submittedTo'));
  return {
    status: rawStatus === 'all' ? '' : (status ?? 'UNDER_REVIEW'),
    purpose: purpose ?? '',
    method: method ?? '',
    ...(reviewOverdue === 'true' || reviewOverdue === 'false'
      ? { reviewOverdue: reviewOverdue === 'true' }
      : {}),
    ...(orderNumber === undefined || orderNumber.length === 0 ? {} : { orderNumber }),
    ...(submittedFrom === undefined ? {} : { submittedFrom }),
    ...(submittedTo === undefined ? {} : { submittedTo }),
    page: positiveInteger(search.get('page'), 1),
    pageSize: 20,
    sortBy: paymentSortBy(search.get('sortBy')),
    sortOrder: search.get('sortOrder') === 'desc' ? 'desc' : 'asc',
  };
}

export function paymentQueryHref(query: PaymentListQuery, page = query.page): string {
  const search = new URLSearchParams();
  search.set('status', query.status || 'all');
  if (query.purpose) search.set('purpose', query.purpose);
  if (query.method) search.set('method', query.method);
  if (query.reviewOverdue !== undefined) search.set('reviewOverdue', String(query.reviewOverdue));
  if (query.orderNumber) search.set('orderNumber', query.orderNumber);
  if (query.submittedFrom) search.set('submittedFrom', query.submittedFrom);
  if (query.submittedTo) search.set('submittedTo', query.submittedTo);
  if (page > 1) search.set('page', String(page));
  if (query.sortBy !== PAYMENT_DEFAULT_QUERY.sortBy) search.set('sortBy', query.sortBy);
  if (query.sortOrder !== PAYMENT_DEFAULT_QUERY.sortOrder) search.set('sortOrder', query.sortOrder);
  const suffix = search.toString();
  return suffix.length === 0 ? '/backoffice/payments' : `/backoffice/payments?${suffix}`;
}

function paymentStatus(value: string | null): PaymentStatus | undefined {
  if (
    value === 'AWAITING_PROOF' ||
    value === 'UNDER_REVIEW' ||
    value === 'VERIFIED' ||
    value === 'REJECTED' ||
    value === 'EXPIRED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return undefined;
}

function paymentPurpose(value: string | null): PaymentListQuery['purpose'] | undefined {
  if (value === 'DEPOSIT' || value === 'BALANCE' || value === 'FULL_PAYMENT') return value;
  return undefined;
}

function paymentMethod(value: string | null): PaymentListQuery['method'] | undefined {
  if (value === 'BANK_TRANSFER' || value === 'CASH' || value === 'COD' || value === 'OTHER') {
    return value;
  }
  return undefined;
}

function paymentSortBy(value: string | null): PaymentListQuery['sortBy'] {
  if (value === 'expiresAt' || value === 'createdAt' || value === 'expectedAmount') return value;
  return 'submittedAt';
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validDate(value: string | null): string | undefined {
  if (
    value === null ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return undefined;
  }
  return value;
}
