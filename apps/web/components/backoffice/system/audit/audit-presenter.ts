import type { AuditLogDetail, AuditLogListItem, AuditQuery } from '@/lib/system-admin-api';

export const DEFAULT_AUDIT_QUERY: AuditQuery = {
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export interface AuditFilterDraft {
  readonly action: string;
  readonly actorType: '' | NonNullable<AuditQuery['actorType']>;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly requestId: string;
  readonly resourceType: string;
  readonly sortOrder: AuditQuery['sortOrder'];
}

export type AuditFilterErrors = Partial<Record<'action' | 'createdTo' | 'resourceType', string>>;

export interface AuditListRow {
  readonly actionLabel: string;
  readonly actorInitials: string;
  readonly actorLabel: string;
  readonly createdAt: string;
  readonly createdAtLabel: string;
  readonly id: string;
  readonly resourceId: string | null;
  readonly resourceLabel: string;
}

export interface AuditPayloadField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface AuditPayloadGroup {
  readonly fields: readonly AuditPayloadField[];
  readonly key: string;
  readonly title?: string;
}

export interface AuditPayloadPresentation {
  readonly fallbackJson?: string;
  readonly groups: readonly AuditPayloadGroup[];
}

export const AUDIT_ACTION_FILTERS = [
  { label: 'Tất cả hành động', value: '' },
  { label: 'Nhân viên', value: 'employee.*' },
  { label: 'Khách hàng', value: 'customer.*' },
  { label: 'Cấu hình cửa hàng', value: 'settings.*' },
  { label: 'Đơn hàng', value: 'order.*' },
  { label: 'Thanh toán', value: 'payment.*' },
  { label: 'Hoàn tiền', value: 'refund.*' },
  { label: 'Giao hàng', value: 'shipment.*' },
  { label: 'Kho hàng', value: 'inventory.*' },
  { label: 'Danh mục', value: 'catalog.*' },
  { label: 'Hỗ trợ sau mua', value: 'after_sales.*' },
  { label: 'Bảo hành', value: 'warranty.*' },
  { label: 'Chính sách bảo hành', value: 'warranty_policy.*' },
  { label: 'Mã ưu đãi', value: 'voucher.*' },
] as const;

const ACTOR_TYPES = new Set<NonNullable<AuditQuery['actorType']>>(['USER', 'GUEST', 'SYSTEM']);
const ACTION_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*(?:\.[a-z][a-z0-9_]*|\.\*)$/;
const RESOURCE_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,254}$/;

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  after_sales: 'yêu cầu hỗ trợ sau mua',
  'catalog.product': 'sản phẩm',
  'catalog.variant': 'phiên bản sản phẩm',
  customer: 'khách hàng',
  employee: 'nhân viên',
  'fulfillment.pickup': 'đơn nhận tại cửa hàng',
  'inventory.cost': 'giá vốn',
  'inventory.identifier': 'mã định danh máy',
  'inventory.inspection': 'phiếu kiểm định',
  'inventory.unit': 'máy trong kho',
  'inventory.unit.identifiers': 'mã định danh máy',
  'inventory.unit.intake': 'máy nhập kho',
  'media.product': 'ảnh sản phẩm',
  order: 'đơn hàng',
  payment: 'thanh toán',
  refund: 'hoàn tiền',
  settings: 'cấu hình cửa hàng',
  'settings.bank_qr': 'mã QR chuyển khoản',
  shipment: 'giao hàng',
  voucher: 'mã ưu đãi',
  warranty: 'bảo hành',
  warranty_policy: 'chính sách bảo hành',
};

const EVENT_LABELS: Readonly<Record<string, string>> = {
  activated: 'Đã kích hoạt',
  added: 'Đã thêm',
  archived: 'Đã lưu trữ',
  assigned: 'Đã phân công',
  attached: 'Đã thêm',
  cancelled: 'Đã hủy',
  completed: 'Đã hoàn tất',
  created: 'Đã tạo',
  deleted: 'Đã xóa',
  delivered: 'Đã giao',
  disabled: 'Đã vô hiệu hóa',
  enabled: 'Đã kích hoạt lại',
  evidence_viewed: 'Đã xem minh chứng của',
  expired: 'Đã hết hạn',
  failed: 'Đã ghi nhận thất bại cho',
  handed_over: 'Đã bàn giao',
  hold_extended: 'Đã gia hạn giữ',
  identifier_lookup: 'Đã tra cứu mã của',
  identifiers_updated: 'Đã cập nhật mã của',
  inspection_summary_recorded: 'Đã ghi nhận kiểm định cho',
  internal_note_updated: 'Đã cập nhật ghi chú của',
  invitation_resent: 'Đã gửi lại lời mời cho',
  lookup: 'Đã tra cứu',
  made_available: 'Đã mở bán',
  proof_submitted: 'Đã nộp minh chứng cho',
  published: 'Đã công khai',
  rejected: 'Đã từ chối',
  resolved: 'Đã hoàn tất',
  returned: 'Đã hoàn về',
  reveal: 'Đã xem mã của',
  shipping_fee_overridden: 'Đã điều chỉnh phí giao của',
  suspended: 'Đã tạm khóa',
  transferred: 'Đã chuyển',
  updated: 'Đã cập nhật',
  verified: 'Đã xác nhận',
  voided: 'Đã hủy hiệu lực',
};

const ACTION_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  'after_sales.attachment_added': 'Đã thêm tệp cho yêu cầu hỗ trợ sau mua',
  'after_sales.attachment_viewed': 'Đã xem tệp của yêu cầu hỗ trợ sau mua',
  'fulfillment.pickup_completed': 'Đã hoàn tất đơn nhận tại cửa hàng',
  'fulfillment.pickup_expired': 'Đã ghi nhận hết hạn đơn nhận tại cửa hàng',
  'fulfillment.pickup_hold_extended': 'Đã gia hạn giữ đơn nhận tại cửa hàng',
  'settings.bank_qr_updated': 'Đã cập nhật mã QR chuyển khoản',
};

const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  AfterSalesRequest: 'Yêu cầu hỗ trợ sau mua',
  InventoryInspection: 'Phiếu kiểm định',
  InventoryUnit: 'Máy trong kho',
  Order: 'Đơn hàng',
  Payment: 'Thanh toán',
  Product: 'Sản phẩm',
  ProductMedia: 'Ảnh sản phẩm',
  ProductVariant: 'Phiên bản sản phẩm',
  Refund: 'Hoàn tiền',
  Shipment: 'Giao hàng',
  StockMovement: 'Biến động kho',
  StoreSettings: 'Cấu hình cửa hàng',
  User: 'Tài khoản',
  Voucher: 'Mã ưu đãi',
  Warranty: 'Bảo hành',
  WarrantyPolicy: 'Chính sách bảo hành',
};

const PAYLOAD_GROUP_LABELS: Readonly<Record<string, string>> = {
  after: 'Sau thay đổi',
  before: 'Trước thay đổi',
};

const PAYLOAD_FIELD_LABELS: Readonly<Record<string, string>> = {
  acquisitionCost: 'Giá nhập',
  address: 'Địa chỉ cửa hàng',
  altText: 'Văn bản thay thế',
  amount: 'Số tiền',
  assignedToId: 'Mã người được phân công',
  attachmentId: 'Mã tệp đính kèm',
  carrierName: 'Nhà mạng',
  code: 'Mã',
  compareAtPrice: 'Giá so sánh',
  configured: 'Đã cấu hình',
  defaultShippingFee: 'Phí giao hàng mặc định',
  discountType: 'Loại giảm giá',
  discountValue: 'Mức giảm',
  employeeCode: 'Mã nhân viên',
  endsAt: 'Thời điểm kết thúc',
  evidenceStatus: 'Trạng thái minh chứng',
  expiresAt: 'Thời điểm hết hạn',
  fields: 'Trường đã cập nhật',
  fileSize: 'Kích thước tệp',
  fulfillmentStatus: 'Trạng thái thực hiện đơn',
  fulfillmentType: 'Hình thức nhận hàng',
  fullName: 'Họ tên',
  hiredAt: 'Ngày nhận việc',
  hotline: 'Số điện thoại hỗ trợ',
  identifierType: 'Loại mã định danh',
  identifierTypes: 'Loại mã định danh',
  inspectionType: 'Loại kiểm định',
  invitationIssued: 'Đã phát hành lời mời',
  inventoryUnitId: 'Mã máy trong kho',
  isCurrent: 'Kết quả hiện hành',
  issue: 'Mô tả vấn đề',
  lifecycleStatus: 'Trạng thái vòng đời',
  locationId: 'Mã địa điểm',
  maxDiscountAmount: 'Mức giảm tối đa',
  method: 'Phương thức',
  mimeType: 'Định dạng tệp',
  minimumOrderAmount: 'Giá trị đơn tối thiểu',
  modelNumber: 'Mã kiểu máy',
  orderItemId: 'Mã sản phẩm trong đơn',
  orderNumber: 'Mã đơn hàng',
  outcome: 'Kết quả tra cứu',
  overallResult: 'Kết quả kiểm định',
  ownerId: 'Mã chủ sở hữu',
  ownerType: 'Loại chủ sở hữu',
  phone: 'Số điện thoại',
  perCustomerLimit: 'Giới hạn mỗi khách hàng',
  quantity: 'Số lượng',
  quantityOnHand: 'Số lượng thực tế',
  quantityReserved: 'Số lượng đang giữ',
  reason: 'Lý do',
  refundAmount: 'Số tiền hoàn',
  refundId: 'Mã hoàn tiền',
  requestNumber: 'Mã yêu cầu',
  requestedResolution: 'Phương án mong muốn',
  resolutionType: 'Phương án xử lý',
  result: 'Kết quả',
  refurbishmentCost: 'Chi phí tân trang',
  regionCode: 'Mã thị trường',
  role: 'Vai trò',
  salePrice: 'Giá bán',
  schemaVersion: 'Phiên bản cấu trúc',
  scopeType: 'Phạm vi áp dụng',
  shippingFee: 'Phí giao hàng',
  simConfiguration: 'Cấu hình SIM',
  sortOrder: 'Thứ tự hiển thị',
  startsAt: 'Thời điểm bắt đầu',
  status: 'Trạng thái',
  storeName: 'Tên cửa hàng',
  subtotal: 'Tạm tính',
  summaryLength: 'Độ dài nội dung kiểm định',
  supportHours: 'Giờ hỗ trợ',
  totalUsageLimit: 'Tổng lượt sử dụng tối đa',
  type: 'Loại',
  unitId: 'Mã máy trong kho',
  visibility: 'Phạm vi hiển thị',
  voucherDiscountAmount: 'Giảm giá từ mã ưu đãi',
  warrantyDaysOverride: 'Số ngày bảo hành tùy chỉnh',
};

const PAYLOAD_VALUE_LABELS: Readonly<Record<string, string>> = {
  ABANDONED: 'Đã bỏ dở',
  ACCEPTED: 'Đã tiếp nhận',
  ACTIVE: 'Đang hoạt động',
  ADMIN: 'Quản trị viên',
  APPROVED: 'Đã duyệt',
  ARCHIVED: 'Đã lưu trữ',
  AVAILABLE: 'Sẵn sàng bán',
  AWAITING_PROOF: 'Chờ minh chứng',
  BANK_TRANSFER: 'Chuyển khoản',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã hoàn tất',
  CONFIRMED: 'Đã xác nhận',
  CONSUMED: 'Đã sử dụng',
  CUSTOMER: 'Khách hàng',
  DEGRADED: 'Cần kiểm tra',
  DELIVERED: 'Đã giao',
  DISABLED: 'Đã vô hiệu hóa',
  DRAFT: 'Bản nháp',
  EMPLOYEE: 'Nhân viên',
  EXPIRED: 'Đã hết hạn',
  FAILED: 'Thất bại',
  FIXED_AMOUNT: 'Giảm số tiền cố định',
  FOUND: 'Đã tìm thấy',
  HANDED_TO_CARRIER: 'Đã bàn giao đơn vị vận chuyển',
  IN_TRANSIT: 'Đang vận chuyển',
  INACTIVE: 'Ngưng hoạt động',
  INCOMPLETE: 'Chưa hoàn tất',
  INSPECTING: 'Đang kiểm định',
  NOT_FOUND: 'Không tìm thấy',
  ORDER: 'Toàn bộ đơn hàng',
  PARTIAL: 'Đạt một phần',
  PASSED: 'Đạt yêu cầu',
  PAUSED: 'Đang tạm dừng',
  PENDING: 'Đang chờ',
  PENDING_VERIFICATION: 'Chờ xác minh',
  PERCENTAGE: 'Giảm theo phần trăm',
  PICKUP: 'Nhận tại cửa hàng',
  PRIVATE: 'Nội bộ',
  PRODUCTS: 'Sản phẩm được chọn',
  PRODUCT_TYPE: 'Theo loại sản phẩm',
  PUBLIC: 'Công khai',
  READY: 'Sẵn sàng',
  RECEIVED: 'Đã tiếp nhận',
  REJECTED: 'Đã từ chối',
  REQUESTED: 'Đã yêu cầu',
  RESOLVED: 'Đã xử lý',
  SHIPMENT: 'Giao hàng',
  SOLD: 'Đã bán',
  SUCCESS: 'Thành công',
  SUSPENDED: 'Tạm khóa',
  UNDER_REVIEW: 'Đang xem xét',
  UNAVAILABLE: 'Chưa sẵn sàng',
  VOIDED: 'Đã hủy hiệu lực',
  VARIANTS: 'Phiên bản được chọn',
  success: 'Thành công',
};

const MONEY_FIELDS = new Set([
  'acquisitionCost',
  'amount',
  'compareAtPrice',
  'defaultShippingFee',
  'maxDiscountAmount',
  'minimumOrderAmount',
  'refundAmount',
  'refurbishmentCost',
  'salePrice',
  'shippingFee',
  'subtotal',
  'voucherDiscountAmount',
]);

interface SearchParamsReader {
  get(name: string): string | null;
}

export function parseAuditQuery(params: SearchParamsReader): AuditQuery {
  const actorType = optionalValue(params.get('actorType'));
  const action = validAction(optionalValue(params.get('action')));
  const resourceType = validResourceType(optionalValue(params.get('resourceType')));
  const requestId = boundedText(optionalValue(params.get('requestId')), 64);
  const createdFrom = validIsoDate(optionalValue(params.get('createdFrom')));
  const createdTo = validIsoDate(optionalValue(params.get('createdTo')));
  const normalizedCreatedTo =
    createdFrom !== undefined && createdTo !== undefined && createdFrom > createdTo
      ? undefined
      : createdTo;
  const sortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  return {
    ...DEFAULT_AUDIT_QUERY,
    page: positiveInteger(params.get('page'), 1),
    sortOrder,
    ...(actorType !== undefined &&
    ACTOR_TYPES.has(actorType as NonNullable<AuditQuery['actorType']>)
      ? { actorType: actorType as NonNullable<AuditQuery['actorType']> }
      : {}),
    ...(action === undefined ? {} : { action }),
    ...(resourceType === undefined ? {} : { resourceType }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(normalizedCreatedTo === undefined ? {} : { createdTo: normalizedCreatedTo }),
  };
}

export function auditDraftFromQuery(query: AuditQuery): AuditFilterDraft {
  return {
    action: query.action ?? '',
    actorType: query.actorType ?? '',
    createdFrom: toLocalDateTimeInput(query.createdFrom),
    createdTo: toLocalDateTimeInput(query.createdTo),
    requestId: query.requestId ?? '',
    resourceType: query.resourceType ?? '',
    sortOrder: query.sortOrder,
  };
}

export function auditQueryFromDraft(draft: AuditFilterDraft): {
  readonly errors: AuditFilterErrors;
  readonly query?: AuditQuery;
} {
  const errors: AuditFilterErrors = {};
  const action = optionalValue(draft.action);
  const resourceType = optionalValue(draft.resourceType);
  const createdFrom = localDateTimeToIso(draft.createdFrom);
  const createdTo = localDateTimeToIso(draft.createdTo);

  if (action !== undefined && validAction(action) === undefined) {
    errors.action = 'Chọn một nhóm hành động hợp lệ.';
  }
  if (resourceType !== undefined && validResourceType(resourceType) === undefined) {
    errors.resourceType = 'Loại đối tượng chỉ gồm chữ, số hoặc dấu gạch dưới.';
  }
  if (createdFrom !== undefined && createdTo !== undefined && createdFrom > createdTo) {
    errors.createdTo = 'Thời điểm kết thúc phải sau thời điểm bắt đầu.';
  }
  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    query: {
      ...DEFAULT_AUDIT_QUERY,
      sortOrder: draft.sortOrder,
      ...(draft.actorType === '' ? {} : { actorType: draft.actorType }),
      ...(action === undefined ? {} : { action }),
      ...(resourceType === undefined ? {} : { resourceType }),
      ...(optionalValue(draft.requestId) === undefined
        ? {}
        : { requestId: draft.requestId.trim().slice(0, 64) }),
      ...(createdFrom === undefined ? {} : { createdFrom }),
      ...(createdTo === undefined ? {} : { createdTo }),
    },
  };
}

export function auditWorkspaceHref(query: AuditQuery, selectedId?: string): string {
  const pathname =
    selectedId === undefined
      ? '/backoffice/audit-logs'
      : `/backoffice/audit-logs/${encodeURIComponent(selectedId)}`;
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.actorType !== undefined) params.set('actorType', query.actorType);
  if (query.action !== undefined) params.set('action', query.action);
  if (query.resourceType !== undefined) params.set('resourceType', query.resourceType);
  if (query.requestId !== undefined) params.set('requestId', query.requestId);
  if (query.createdFrom !== undefined) params.set('createdFrom', query.createdFrom);
  if (query.createdTo !== undefined) params.set('createdTo', query.createdTo);
  if (query.sortOrder !== 'desc') params.set('sortOrder', query.sortOrder);
  const queryString = params.toString();
  return `${pathname}${queryString === '' ? '' : `?${queryString}`}`;
}

export function projectAuditListItem(item: AuditLogListItem): AuditListRow {
  const actorLabel = auditActorLabel(item);
  return {
    actionLabel: auditActionLabel(item.action),
    actorInitials: initials(actorLabel),
    actorLabel,
    createdAt: item.createdAt,
    createdAtLabel: formatAuditDateTime(item.createdAt),
    id: item.id,
    resourceId: item.resourceId ?? null,
    resourceLabel: auditResourceLabel(item.resourceType),
  };
}

export function auditActorLabel(item: Pick<AuditLogListItem, 'actor' | 'actorType'>): string {
  if (item.actor?.fullName !== undefined && item.actor.fullName.trim() !== '') {
    return item.actor.fullName;
  }
  if (item.actorType === 'SYSTEM') return 'Hệ thống';
  if (item.actorType === 'GUEST') return 'Khách vãng lai';
  return 'Người dùng';
}

export function auditActionLabel(action: string): string {
  const override = ACTION_LABEL_OVERRIDES[action];
  if (override !== undefined) return override;
  const entity = Object.keys(ENTITY_LABELS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => action.startsWith(`${candidate}.`));
  if (entity === undefined) return 'Hoạt động hệ thống';
  const event = action.slice(entity.length + 1);
  const eventLabel = EVENT_LABELS[event];
  const entityLabel = ENTITY_LABELS[entity] ?? 'đối tượng hệ thống';
  if (eventLabel === undefined) return `Đã thay đổi ${entityLabel}`;
  return `${eventLabel} ${entityLabel}`;
}

export function auditResourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? 'Đối tượng hệ thống';
}

export function formatAuditDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'Chưa ghi nhận';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function formatAuditJson(value: AuditLogDetail['changes']): string | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

export function humanizeAuditPayload(value: AuditLogDetail['changes']): AuditPayloadPresentation {
  if (!isRecord(value)) {
    const fallbackJson = formatAuditJson(value);
    return {
      groups: [],
      ...(fallbackJson === undefined ? {} : { fallbackJson }),
    };
  }

  const groups: AuditPayloadGroup[] = [];
  const fallback: Record<string, unknown> = {};
  const rootFields: AuditPayloadField[] = [];

  for (const [key, entry] of Object.entries(value)) {
    const groupTitle = PAYLOAD_GROUP_LABELS[key];
    if (groupTitle !== undefined && isRecord(entry)) {
      const groupFields: AuditPayloadField[] = [];
      const groupFallback: Record<string, unknown> = {};
      collectKnownFields(entry, groupFields, groupFallback);
      if (groupFields.length > 0) {
        groups.push({ fields: groupFields, key, title: groupTitle });
      }
      if (Object.keys(groupFallback).length > 0) fallback[key] = groupFallback;
      continue;
    }

    const field = auditPayloadField(key, entry);
    if (field === undefined) fallback[key] = entry;
    else rootFields.push(field);
  }

  groups.sort((left, right) => Number(left.key === 'after') - Number(right.key === 'after'));
  if (rootFields.length > 0) groups.unshift({ fields: rootFields, key: 'summary' });
  const fallbackJson =
    Object.keys(fallback).length === 0
      ? undefined
      : formatAuditJson(fallback as AuditLogDetail['changes']);
  return {
    groups,
    ...(fallbackJson === undefined ? {} : { fallbackJson }),
  };
}

function collectKnownFields(
  value: Readonly<Record<string, unknown>>,
  fields: AuditPayloadField[],
  fallback: Record<string, unknown>,
) {
  for (const [key, entry] of Object.entries(value)) {
    const field = auditPayloadField(key, entry);
    if (field === undefined) fallback[key] = entry;
    else fields.push(field);
  }
}

function auditPayloadField(key: string, value: unknown): AuditPayloadField | undefined {
  const label = PAYLOAD_FIELD_LABELS[key];
  if (label === undefined) return undefined;
  const formatted = formatKnownAuditValue(key, value);
  return formatted === undefined ? undefined : { key, label, value: formatted };
}

function formatKnownAuditValue(key: string, value: unknown): string | undefined {
  if (value === null) return 'Không có';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    if (key === 'fileSize') return `${new Intl.NumberFormat('vi-VN').format(value)} byte`;
    if (MONEY_FIELDS.has(key)) return formatAuditMoney(value);
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  if (typeof value === 'string') {
    if (MONEY_FIELDS.has(key) && /^-?\d+(?:\.\d+)?$/.test(value)) {
      return formatAuditMoney(Number(value));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatAuditDateOnly(value);
    if (key.endsWith('At') && !Number.isNaN(Date.parse(value))) return formatAuditDateTime(value);
    const translated = PAYLOAD_VALUE_LABELS[value];
    if (translated !== undefined) return translated;
    return /^[A-Z][A-Z0-9_]*$/.test(value) ? undefined : value;
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, 20).map((entry) => {
      if (typeof entry !== 'string' && typeof entry !== 'number') return undefined;
      if (key === 'fields' && typeof entry === 'string')
        return PAYLOAD_FIELD_LABELS[entry] ?? entry;
      const translated = PAYLOAD_VALUE_LABELS[String(entry)];
      if (translated !== undefined) return translated;
      return typeof entry === 'string' && /^[A-Z][A-Z0-9_]*$/.test(entry)
        ? undefined
        : String(entry);
    });
    if (visible.some((entry) => entry === undefined)) return undefined;
    const suffix =
      value.length > visible.length ? `, và ${String(value.length - visible.length)} mục khác` : '';
    return `${visible.join(', ')}${suffix}`;
  }
  if (isRecord(value) && typeof value.present === 'boolean') {
    if (!value.present) return 'Không có nội dung';
    return typeof value.length === 'number'
      ? `Có nội dung (${new Intl.NumberFormat('vi-VN').format(value.length)} ký tự)`
      : 'Có nội dung';
  }
  return undefined;
}

function formatAuditDateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return 'Chưa ghi nhận';
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}

function formatAuditMoney(value: number): string {
  if (!Number.isFinite(value)) return 'Chưa ghi nhận';
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HT';
  const selected = parts.length === 1 ? parts : [parts[0] ?? '', parts.at(-1) ?? ''];
  return selected
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toLocaleUpperCase('vi-VN')
    .slice(0, 2);
}

function optionalValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized === '' ? undefined : normalized;
}

function validAction(value: string | undefined): string | undefined {
  return value !== undefined && value.length <= 255 && ACTION_PATTERN.test(value)
    ? value
    : undefined;
}

function validResourceType(value: string | undefined): string | undefined {
  return value !== undefined && RESOURCE_TYPE_PATTERN.test(value) ? value : undefined;
}

function boundedText(value: string | undefined, maxLength: number): string | undefined {
  return value !== undefined && value.length <= maxLength ? value : undefined;
}

function validIsoDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function localDateTimeToIso(value: string): string | undefined {
  if (value === '') return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function toLocalDateTimeInput(value: string | undefined): string {
  if (value === undefined) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
