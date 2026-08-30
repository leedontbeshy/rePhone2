import type {
  RefundAction,
  RefundDetail,
  RefundListQuery,
  RefundMethod,
  RefundPaymentSummary,
  RefundRequesterType,
  RefundStatus,
} from '@/lib/refund-api';
import type { OperationsTone } from '../operations-primitives';

export interface RefundPresentation {
  readonly label: string;
  readonly tone: OperationsTone;
}

export interface RefundTimelineEntry {
  readonly at: string;
  readonly description?: string;
  readonly label: string;
  readonly state: 'complete' | 'current' | 'danger';
}

type RefundMutableAction = Exclude<RefundAction, 'VIEW_EVIDENCE'>;

export const REFUND_DEFAULT_QUERY: RefundListQuery = {
  status: 'REQUESTED',
  method: '',
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'asc',
};

export function refundStatusPresentation(status: RefundStatus): RefundPresentation {
  if (status === 'REQUESTED') return { label: 'Chờ xử lý', tone: 'warning' };
  if (status === 'PROCESSING') return { label: 'Đang xử lý', tone: 'info' };
  if (status === 'COMPLETED') return { label: 'Đã hoàn tiền', tone: 'success' };
  if (status === 'REJECTED') return { label: 'Đã từ chối', tone: 'danger' };
  return { label: 'Đã hủy', tone: 'neutral' };
}

export function refundMethodLabel(method: RefundMethod | RefundPaymentSummary['method']): string {
  if (method === 'BANK_TRANSFER') return 'Chuyển khoản';
  if (method === 'CASH') return 'Tiền mặt';
  if (method === 'COD') return 'Thanh toán khi nhận hàng';
  return 'Phương thức khác';
}

export function refundRequesterTypeLabel(type: RefundRequesterType): string {
  if (type === 'CUSTOMER') return 'Khách hàng';
  if (type === 'STAFF') return 'Nhân viên';
  return 'Hệ thống';
}

export function refundOrderStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    PLACED: 'Đã đặt hàng',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang xử lý',
    PREPARING: 'Đang chuẩn bị',
    COMPLETED: 'Đã hoàn tất',
    CANCELLED: 'Đã hủy',
  };
  return labels[value] ?? 'Đang cập nhật';
}

export function refundFulfillmentStatusLabel(value: string): string {
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

export function refundPaymentStatusLabel(value: string): string {
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

export function refundPaymentPurposeLabel(value: RefundPaymentSummary['purpose']): string {
  if (value === 'DEPOSIT') return 'Khoản đặt cọc';
  if (value === 'BALANCE') return 'Phần còn lại';
  return 'Toàn bộ đơn hàng';
}

export function refundDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return 'Chưa có';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function refundMoney(value: string): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '0'} đ`;
}

export function refundFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

export function refundPrimaryAction(actions: readonly RefundAction[]): RefundMutableAction | null {
  const priority: readonly RefundMutableAction[] = [
    'START_PROCESSING',
    'COMPLETE_BANK_TRANSFER',
    'COMPLETE_CASH',
    'REJECT',
    'CANCEL',
  ];
  return priority.find((action) => actions.includes(action)) ?? null;
}

export function refundTimeline(detail: RefundDetail): RefundTimelineEntry[] {
  const entries: RefundTimelineEntry[] = [
    {
      at: detail.createdAt,
      label: 'Đã tạo yêu cầu',
      state: detail.status === 'REQUESTED' ? 'current' : 'complete',
    },
  ];
  if (detail.processingAt !== null && detail.processingAt !== undefined) {
    const processorDescription =
      detail.processor === null || detail.processor === undefined
        ? undefined
        : `Người xử lý: ${detail.processor.fullName}`;
    entries.push({
      at: detail.processingAt,
      label: 'Bắt đầu xử lý',
      ...(processorDescription === undefined ? {} : { description: processorDescription }),
      state: detail.status === 'PROCESSING' ? 'current' : 'complete',
    });
  }
  if (detail.completedAt !== null && detail.completedAt !== undefined) {
    entries.push({ at: detail.completedAt, label: 'Đã hoàn tiền', state: 'complete' });
  }
  if (detail.terminalAt !== null && detail.terminalAt !== undefined) {
    const terminalDescription =
      detail.terminalActor === null || detail.terminalActor === undefined
        ? undefined
        : `Người cập nhật: ${detail.terminalActor.fullName}`;
    entries.push({
      at: detail.terminalAt,
      label: detail.status === 'REJECTED' ? 'Đã từ chối' : 'Đã hủy yêu cầu',
      ...(terminalDescription === undefined ? {} : { description: terminalDescription }),
      state: detail.status === 'REJECTED' ? 'danger' : 'complete',
    });
  }
  return entries;
}

export function refundQueryFromSearch(search: URLSearchParams): RefundListQuery {
  const statusValue = search.get('status');
  const orderNumber = search.get('orderNumber')?.trim().slice(0, 64);
  const createdFrom = validDate(search.get('createdFrom'));
  const createdTo = validDate(search.get('createdTo'));
  return {
    status: statusValue === 'all' ? '' : (refundStatus(statusValue) ?? 'REQUESTED'),
    method: refundMethod(search.get('method')) ?? '',
    ...(orderNumber === undefined || orderNumber.length === 0
      ? {}
      : { orderNumber: orderNumber.toUpperCase() }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdTo === undefined ? {} : { createdTo }),
    page: positiveInteger(search.get('page'), 1),
    pageSize: 20,
    sortBy: refundSortBy(search.get('sortBy')),
    sortOrder: search.get('sortOrder') === 'desc' ? 'desc' : 'asc',
  };
}

export function refundQueryHref(query: RefundListQuery, page = query.page): string {
  const search = new URLSearchParams();
  search.set('status', query.status || 'all');
  if (query.method) search.set('method', query.method);
  if (query.orderNumber) search.set('orderNumber', query.orderNumber);
  if (query.createdFrom) search.set('createdFrom', query.createdFrom);
  if (query.createdTo) search.set('createdTo', query.createdTo);
  if (page > 1) search.set('page', String(page));
  if (query.sortBy !== REFUND_DEFAULT_QUERY.sortBy) search.set('sortBy', query.sortBy);
  if (query.sortOrder !== REFUND_DEFAULT_QUERY.sortOrder) search.set('sortOrder', query.sortOrder);
  const suffix = search.toString();
  return suffix.length === 0 ? '/backoffice/refunds' : `/backoffice/refunds?${suffix}`;
}

function refundStatus(value: string | null): RefundStatus | undefined {
  if (
    value === 'REQUESTED' ||
    value === 'PROCESSING' ||
    value === 'COMPLETED' ||
    value === 'REJECTED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return undefined;
}

function refundMethod(value: string | null): RefundMethod | undefined {
  if (value === 'BANK_TRANSFER' || value === 'CASH' || value === 'OTHER') return value;
  return undefined;
}

function refundSortBy(value: string | null): RefundListQuery['sortBy'] {
  if (value === 'amount' || value === 'processingAt') return value;
  return 'createdAt';
}

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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
