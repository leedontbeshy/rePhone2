import type {
  BackofficeFulfillmentStatus,
  BackofficeOrderDetail,
  BackofficeOrderListQuery,
  BackofficeOrderStatus,
  BackofficePaymentStatus,
  FulfillmentAction,
} from '@/lib/fulfillment-api';
import type {
  OperationsStatusAxis,
  OperationsTimelineItem,
  OperationsTone,
} from '../operations-primitives';

export interface OrderFilterDraft {
  readonly fulfillmentStatus: '' | BackofficeFulfillmentStatus;
  readonly fulfillmentType: '' | 'PICKUP' | 'SHIPPING';
  readonly paymentStatus: '' | BackofficePaymentStatus;
  readonly pickupOverdue: '' | 'false' | 'true';
  readonly q: string;
  readonly sortBy: BackofficeOrderListQuery['sortBy'];
  readonly sortOrder: BackofficeOrderListQuery['sortOrder'];
  readonly status: '' | BackofficeOrderStatus;
}

export const ORDER_PAGE_SIZE = 20;

export const DEFAULT_ORDER_FILTERS: OrderFilterDraft = {
  fulfillmentStatus: '',
  fulfillmentType: '',
  paymentStatus: '',
  pickupOverdue: '',
  q: '',
  sortBy: 'placedAt',
  sortOrder: 'desc',
  status: '',
};

interface SearchParamsLike {
  get(name: string): string | null;
}

export function parseOrderListQuery(params: SearchParamsLike): BackofficeOrderListQuery {
  const fulfillmentType = params.get('fulfillmentType');
  const pickupOverdue = params.get('pickupOverdue');
  const normalizedFulfillmentType =
    fulfillmentType === 'PICKUP' || fulfillmentType === 'SHIPPING' ? fulfillmentType : '';
  const normalizedSortBy = sortByValue(params.get('sortBy'));
  return {
    q: (params.get('q')?.trim() ?? '').slice(0, 100),
    status: orderStatusValue(params.get('status')),
    fulfillmentStatus: fulfillmentStatusValue(params.get('fulfillmentStatus')),
    paymentStatus: paymentStatusValue(params.get('paymentStatus')),
    fulfillmentType: normalizedFulfillmentType,
    ...(normalizedFulfillmentType !== 'SHIPPING' &&
    (pickupOverdue === 'true' || pickupOverdue === 'false')
      ? { pickupOverdue: pickupOverdue === 'true' }
      : {}),
    page: positiveInteger(params.get('page'), 1),
    pageSize: ORDER_PAGE_SIZE,
    sortBy:
      normalizedFulfillmentType === 'SHIPPING' && normalizedSortBy === 'pickupHoldUntil'
        ? 'placedAt'
        : normalizedSortBy,
    sortOrder: params.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

export function orderDraftFromQuery(query: BackofficeOrderListQuery): OrderFilterDraft {
  return {
    fulfillmentStatus: query.fulfillmentStatus ?? '',
    fulfillmentType: query.fulfillmentType ?? '',
    paymentStatus: query.paymentStatus ?? '',
    pickupOverdue: query.pickupOverdue === undefined ? '' : query.pickupOverdue ? 'true' : 'false',
    q: query.q ?? '',
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    status: query.status ?? '',
  };
}

export function orderQueryFromDraft(draft: OrderFilterDraft, page = 1): BackofficeOrderListQuery {
  const shipping = draft.fulfillmentType === 'SHIPPING';
  return {
    q: draft.q.trim().slice(0, 100),
    status: draft.status,
    fulfillmentStatus: draft.fulfillmentStatus,
    paymentStatus: draft.paymentStatus,
    fulfillmentType: draft.fulfillmentType,
    ...(shipping || draft.pickupOverdue === ''
      ? {}
      : { pickupOverdue: draft.pickupOverdue === 'true' }),
    page,
    pageSize: ORDER_PAGE_SIZE,
    sortBy: shipping && draft.sortBy === 'pickupHoldUntil' ? 'placedAt' : draft.sortBy,
    sortOrder: draft.sortOrder,
  };
}

export function orderListHref(query: BackofficeOrderListQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  if (query.fulfillmentStatus) params.set('fulfillmentStatus', query.fulfillmentStatus);
  if (query.paymentStatus) params.set('paymentStatus', query.paymentStatus);
  if (query.fulfillmentType) params.set('fulfillmentType', query.fulfillmentType);
  if (query.pickupOverdue !== undefined) {
    params.set('pickupOverdue', query.pickupOverdue ? 'true' : 'false');
  }
  if (query.sortBy !== 'placedAt') params.set('sortBy', query.sortBy);
  if (query.sortOrder !== 'desc') params.set('sortOrder', query.sortOrder);
  if (query.page > 1) params.set('page', String(query.page));
  const value = params.toString();
  return value === '' ? '/backoffice/orders' : `/backoffice/orders?${value}`;
}

export function orderSortDirectionLabels(
  sortBy: BackofficeOrderListQuery['sortBy'],
): Readonly<{ asc: string; desc: string }> {
  if (sortBy === 'grandTotal') {
    return { asc: 'Giá trị thấp đến cao', desc: 'Giá trị cao đến thấp' };
  }
  if (sortBy === 'pickupHoldUntil') {
    return { asc: 'Hạn sớm nhất trước', desc: 'Hạn muộn nhất trước' };
  }
  return { asc: 'Cũ nhất trước', desc: 'Mới nhất trước' };
}

export function orderStatusLabel(status: BackofficeOrderStatus): string {
  const labels: Record<BackofficeOrderStatus, string> = {
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã hoàn tất',
    CONFIRMED: 'Đã xác nhận',
    PLACED: 'Đã đặt hàng',
    PROCESSING: 'Đang xử lý',
  };
  return labels[status];
}

export function fulfillmentStatusLabel(status: BackofficeFulfillmentStatus): string {
  const labels: Record<BackofficeFulfillmentStatus, string> = {
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã giao hàng',
    FAILED: 'Giao hàng thất bại',
    IN_TRANSIT: 'Đang giao hàng',
    PENDING: 'Chờ xử lý',
    PREPARING: 'Đang chuẩn bị',
    READY: 'Sẵn sàng nhận',
    RETURNED: 'Đã nhận hàng hoàn',
  };
  return labels[status];
}

export function paymentStatusLabel(status: BackofficePaymentStatus): string {
  const labels: Record<BackofficePaymentStatus, string> = {
    PAID: 'Đã thanh toán',
    PARTIALLY_PAID: 'Đã thanh toán một phần',
    PARTIALLY_REFUNDED: 'Đã hoàn một phần',
    REFUNDED: 'Đã hoàn tiền',
    UNPAID: 'Chưa thanh toán',
  };
  return labels[status];
}

export function orderStatusTone(status: BackofficeOrderStatus): OperationsTone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PROCESSING' || status === 'CONFIRMED') return 'info';
  return 'neutral';
}

export function fulfillmentStatusTone(status: BackofficeFulfillmentStatus): OperationsTone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  if (status === 'RETURNED') return 'warning';
  if (status === 'PREPARING' || status === 'READY' || status === 'IN_TRANSIT') return 'info';
  return 'neutral';
}

export function paymentStatusTone(status: BackofficePaymentStatus): OperationsTone {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID' || status === 'PARTIALLY_REFUNDED') return 'warning';
  if (status === 'REFUNDED') return 'info';
  return 'neutral';
}

export function orderStatusAxes(detail: BackofficeOrderDetail): OperationsStatusAxis[] {
  return [
    {
      kind: 'order',
      label: 'Đơn hàng',
      tone: orderStatusTone(detail.status),
      value: orderStatusLabel(detail.status),
    },
    {
      kind: 'fulfillment',
      label: 'Giao nhận',
      tone: fulfillmentStatusTone(detail.fulfillmentStatus),
      value: fulfillmentStatusLabel(detail.fulfillmentStatus),
    },
    {
      kind: 'payment',
      label: 'Thanh toán',
      tone: paymentStatusTone(detail.paymentStatus),
      value: paymentStatusLabel(detail.paymentStatus),
    },
  ];
}

export function orderActionLabel(action: FulfillmentAction): string {
  const labels: Record<FulfillmentAction, string> = {
    CANCEL_ORDER: 'Hủy đơn hàng',
    COMPLETE_PICKUP: 'Hoàn tất giao tại cửa hàng',
    CONFIRM: 'Xác nhận đơn hàng',
    CREATE_REFUND: 'Tạo yêu cầu hoàn tiền',
    CREATE_SHIPMENT: 'Tạo vận đơn',
    EXTEND_PICKUP_HOLD: 'Gia hạn giữ hàng',
    HAND_OVER_SHIPMENT: 'Bàn giao cho đơn vị vận chuyển',
    MARK_PICKUP_READY: 'Sẵn sàng nhận tại cửa hàng',
    MARK_SHIPMENT_DELIVERED: 'Xác nhận giao thành công',
    MARK_SHIPMENT_FAILED: 'Ghi nhận giao hàng thất bại',
    MARK_SHIPMENT_RETURNED: 'Xác nhận hàng hoàn đã về',
    OVERRIDE_SHIPPING_FEE: 'Điều chỉnh phí giao hàng',
    START_PREPARING: 'Bắt đầu chuẩn bị hàng',
  };
  return labels[action];
}

export function orderActionDescription(action: FulfillmentAction): string {
  const descriptions: Record<FulfillmentAction, string> = {
    CANCEL_ORDER: 'Hủy đơn, giải phóng phần hàng đang giữ và tạo yêu cầu hoàn tiền nếu cần.',
    COMPLETE_PICKUP: 'Xác nhận khách đã nhận hàng và thu phần tiền còn lại nếu có.',
    CONFIRM: 'Xác nhận đơn nhận tại cửa hàng để bắt đầu chuẩn bị hàng.',
    CREATE_REFUND: 'Ghi nhận khoản cần hoàn từ số tiền đã thu của đơn hàng.',
    CREATE_SHIPMENT: 'Lưu đơn vị vận chuyển và mã tra cứu trước khi bàn giao kiện hàng.',
    EXTEND_PICKUP_HOLD: 'Gia hạn thời gian cửa hàng giữ sản phẩm cho khách.',
    HAND_OVER_SHIPMENT: 'Xác nhận kiện hàng đã được giao cho đơn vị vận chuyển.',
    MARK_PICKUP_READY: 'Thông báo đơn đã sẵn sàng để khách đến nhận.',
    MARK_SHIPMENT_DELIVERED: 'Xác nhận giao hàng xong và thu tiền khi nhận hàng nếu có.',
    MARK_SHIPMENT_FAILED: 'Ghi nhận lần giao không thành công để theo dõi hàng hoàn.',
    MARK_SHIPMENT_RETURNED: 'Xác nhận kho hoặc cửa hàng đã thực nhận kiện hàng hoàn.',
    OVERRIDE_SHIPPING_FEE: 'Cập nhật phí giao trước khi khách gửi minh chứng thanh toán.',
    START_PREPARING: 'Chuyển đơn sang giai đoạn lấy và đóng gói sản phẩm.',
  };
  return descriptions[action];
}

export function primaryOrderAction(
  actions: readonly FulfillmentAction[],
): FulfillmentAction | null {
  const priority: readonly FulfillmentAction[] = [
    'CONFIRM',
    'START_PREPARING',
    'MARK_PICKUP_READY',
    'COMPLETE_PICKUP',
    'CREATE_SHIPMENT',
    'HAND_OVER_SHIPMENT',
    'MARK_SHIPMENT_DELIVERED',
    'MARK_SHIPMENT_RETURNED',
    'OVERRIDE_SHIPPING_FEE',
    'EXTEND_PICKUP_HOLD',
    'CREATE_REFUND',
    'MARK_SHIPMENT_FAILED',
    'CANCEL_ORDER',
  ];
  return priority.find((action) => actions.includes(action)) ?? null;
}

export function orderTimeline(detail: BackofficeOrderDetail): OperationsTimelineItem[] {
  const shipment = detail.shipments[0];
  const entries: Array<{ at: string | null; label: string; danger?: boolean }> =
    detail.fulfillmentType === 'PICKUP'
      ? [
          { at: detail.placedAt, label: 'Đã đặt hàng' },
          { at: detail.confirmedAt, label: 'Đã xác nhận đơn' },
          { at: detail.pickupReadyAt, label: 'Sẵn sàng nhận tại cửa hàng' },
          { at: detail.pickedUpAt, label: 'Khách đã nhận hàng' },
          { at: detail.completedAt, label: 'Đơn hàng hoàn tất' },
          { at: detail.cancelledAt, label: 'Đơn hàng đã hủy', danger: true },
        ]
      : [
          { at: detail.placedAt, label: 'Đã đặt hàng' },
          { at: detail.confirmedAt, label: 'Đã xác nhận thanh toán cọc' },
          { at: shipment?.createdAt ?? null, label: 'Đã tạo vận đơn' },
          { at: shipment?.shippedAt ?? null, label: 'Đã bàn giao vận chuyển' },
          ...(shipment?.status === 'FAILED' || shipment?.status === 'RETURNED'
            ? [{ at: shipment.failedAt, label: 'Giao hàng thất bại', danger: true }]
            : [{ at: shipment?.deliveredAt ?? null, label: 'Đã giao hàng' }]),
          ...(shipment?.status === 'RETURNED'
            ? [{ at: shipment.returnedAt, label: 'Đã nhận hàng hoàn' }]
            : []),
          { at: detail.completedAt, label: 'Đơn hàng hoàn tất' },
          { at: detail.cancelledAt, label: 'Đơn hàng đã hủy', danger: true },
        ];

  const relevant = entries.filter((entry, index) => {
    if (entry.at !== null) return true;
    if (detail.status === 'CANCELLED' || detail.status === 'COMPLETED') return false;
    return entries.slice(0, index).every((previous) => previous.at !== null);
  });

  return relevant.map((entry, index) => ({
    at: entry.at === null ? null : formatOrderDateTime(entry.at),
    label: entry.label,
    state:
      entry.at === null
        ? 'current'
        : entry.danger
          ? 'danger'
          : index === relevant.length - 1 && detail.status !== 'COMPLETED'
            ? 'current'
            : 'complete',
  }));
}

export function formatOrderDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}

export function formatOrderAddress(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '—';
  const address = value as Record<string, unknown>;
  return [
    address['receiverName'],
    address['phone'],
    address['addressLine'],
    address['ward'],
    address['district'],
    address['province'],
    address['postalCode'],
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ');
}

export function isPositiveMoney(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

export function moneyExceeds(left: string, right: string): boolean {
  try {
    return BigInt(left) > BigInt(right);
  } catch {
    return true;
  }
}

export function isSafeTrackingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function paymentPurposeLabel(value: string): string {
  if (value === 'BALANCE') return 'Thanh toán phần còn lại';
  if (value === 'FULL_PAYMENT') return 'Thanh toán toàn bộ';
  return 'Thanh toán tiền cọc';
}

export function paymentMethodLabel(value: string): string {
  if (value === 'CASH') return 'Tiền mặt';
  if (value === 'COD') return 'Thu khi giao hàng';
  if (value === 'BANK_TRANSFER') return 'Chuyển khoản';
  return 'Phương thức khác';
}

export function paymentRecordStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    AWAITING_PROOF: 'Chờ minh chứng',
    CANCELLED: 'Đã hủy',
    EXPIRED: 'Đã hết hạn',
    REJECTED: 'Đã từ chối',
    UNDER_REVIEW: 'Chờ kiểm tra',
    VERIFIED: 'Đã xác nhận',
  };
  return labels[value] ?? 'Chưa xác định';
}

export function paymentRecordTone(value: string): OperationsTone {
  if (value === 'VERIFIED') return 'success';
  if (value === 'UNDER_REVIEW') return 'warning';
  if (value === 'REJECTED' || value === 'EXPIRED' || value === 'CANCELLED') return 'danger';
  return 'neutral';
}

export function refundMethodLabel(value: string): string {
  if (value === 'CASH') return 'Tiền mặt';
  if (value === 'BANK_TRANSFER') return 'Chuyển khoản';
  return 'Phương thức khác';
}

export function refundStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã hoàn tiền',
    PROCESSING: 'Đang xử lý',
    REJECTED: 'Đã từ chối',
    REQUESTED: 'Chờ xử lý',
  };
  return labels[value] ?? 'Chưa xác định';
}

export function refundTone(value: string): OperationsTone {
  if (value === 'COMPLETED') return 'success';
  if (value === 'PROCESSING') return 'info';
  if (value === 'REJECTED' || value === 'CANCELLED') return 'danger';
  return 'warning';
}

export function shipmentStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    CANCELLED: 'Đã hủy',
    CREATED: 'Đã tạo vận đơn',
    DELIVERED: 'Đã giao hàng',
    FAILED: 'Giao hàng thất bại',
    HANDED_TO_CARRIER: 'Đã bàn giao vận chuyển',
    RETURNED: 'Đã nhận hàng hoàn',
  };
  return labels[value] ?? 'Chưa xác định';
}

export function shipmentTone(value: string): OperationsTone {
  if (value === 'DELIVERED') return 'success';
  if (value === 'FAILED' || value === 'CANCELLED') return 'danger';
  if (value === 'RETURNED') return 'warning';
  if (value === 'HANDED_TO_CARRIER') return 'info';
  return 'neutral';
}

export function reservationStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang giữ',
    CONSUMED: 'Đã sử dụng',
    EXPIRED: 'Đã hết hạn',
    RELEASED: 'Đã giải phóng',
  };
  return labels[value] ?? 'Chưa xác định';
}

export function holdReasonLabel(value: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: 'Chờ thanh toán cọc',
    FULFILLMENT: 'Chờ giao nhận',
    PICKUP: 'Chờ khách đến nhận',
    REVIEW: 'Chờ kiểm tra thanh toán',
  };
  return labels[value] ?? 'Giữ cho đơn hàng';
}

export function targetTypeLabel(value: string): string {
  if (value === 'INVENTORY_UNIT') return 'Máy vật lý';
  if (value === 'STOCK_LEVEL') return 'Phụ kiện theo số lượng';
  return 'Chưa xác định';
}

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sortByValue(value: string | null): BackofficeOrderListQuery['sortBy'] {
  if (value === 'updatedAt' || value === 'grandTotal' || value === 'pickupHoldUntil') return value;
  return 'placedAt';
}

function orderStatusValue(value: string | null): '' | BackofficeOrderStatus {
  if (
    value === 'PLACED' ||
    value === 'CONFIRMED' ||
    value === 'PROCESSING' ||
    value === 'COMPLETED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return '';
}

function fulfillmentStatusValue(value: string | null): '' | BackofficeFulfillmentStatus {
  if (
    value === 'PENDING' ||
    value === 'PREPARING' ||
    value === 'READY' ||
    value === 'IN_TRANSIT' ||
    value === 'COMPLETED' ||
    value === 'FAILED' ||
    value === 'RETURNED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return '';
}

function paymentStatusValue(value: string | null): '' | BackofficePaymentStatus {
  if (
    value === 'UNPAID' ||
    value === 'PARTIALLY_PAID' ||
    value === 'PAID' ||
    value === 'PARTIALLY_REFUNDED' ||
    value === 'REFUNDED'
  ) {
    return value;
  }
  return '';
}
