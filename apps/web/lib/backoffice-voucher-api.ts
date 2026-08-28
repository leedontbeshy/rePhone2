import { type components, type createApiClient, type paths } from '@rephone/api-client';

export type VoucherApiClient = ReturnType<typeof createApiClient>;
export type Voucher = components['schemas']['BackofficeVoucherDto'];
export type VoucherStatus = Voucher['status'];
export type VoucherDiscountType = Voucher['discountType'];
export type VoucherVisibility = Voucher['visibility'];
export type VoucherScopeType = Voucher['scopeType'];
export type VoucherProductType =
  components['schemas']['VoucherProductTypeScopeConfigDto']['productType'];
export type VoucherUsageStatus = components['schemas']['VoucherUsageDto']['status'];

type VoucherListApiQuery = NonNullable<
  paths['/api/v1/backoffice/vouchers']['get']['parameters']['query']
>;
type VoucherUsageApiQuery = NonNullable<
  paths['/api/v1/backoffice/vouchers/{id}/usages']['get']['parameters']['query']
>;
type GeneratedCreateVoucherInput =
  paths['/api/v1/backoffice/vouchers']['post']['requestBody']['content']['application/json'];
type GeneratedUpdateVoucherInput =
  paths['/api/v1/backoffice/vouchers/{id}']['patch']['requestBody']['content']['application/json'];

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface VoucherPage<T> {
  data: T[];
  pagination: Pagination;
}

export interface VoucherQuery {
  q?: string;
  status?: VoucherStatus | '';
  discountType?: VoucherDiscountType | '';
  scopeType?: VoucherScopeType | '';
  visibility?: VoucherVisibility | '';
  page: number;
  pageSize: number;
}

export interface UsageQuery {
  status?: VoucherUsageStatus | '';
  /** Chỉ dùng khi điều hướng từ một đơn hàng; không hiển thị UUID trong bộ lọc. */
  orderId?: string;
  /** Chỉ dùng khi điều hướng từ hồ sơ khách hàng; không hiển thị UUID trong bộ lọc. */
  customerId?: string;
  page: number;
  pageSize: number;
}

export type VoucherScopeSelection =
  | { scopeType: 'ORDER'; scopeConfig: null }
  | {
      scopeType: 'PRODUCT_TYPE';
      scopeConfig: { productType: VoucherProductType };
    }
  | { scopeType: 'PRODUCTS'; scopeConfig: { productIds: string[] } }
  | { scopeType: 'VARIANTS'; scopeConfig: { variantIds: string[] } };

export type CreateVoucherInput = Omit<GeneratedCreateVoucherInput, 'scopeType' | 'scopeConfig'> &
  VoucherScopeSelection;

type UnchangedVoucherScope = { scopeType?: undefined; scopeConfig?: undefined };
export type UpdateVoucherInput = Omit<GeneratedUpdateVoucherInput, 'scopeType' | 'scopeConfig'> &
  (UnchangedVoucherScope | VoucherScopeSelection);

/** Projection for the usage table. Internal customer UUIDs are deliberately omitted. */
export interface VoucherUsage {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  status: VoucherUsageStatus;
  createdAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
}

export const VOUCHER_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'ACTIVE', label: 'Đang áp dụng' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'ARCHIVED', label: 'Đã lưu trữ' },
] as const satisfies ReadonlyArray<{ value: VoucherStatus; label: string }>;

export const VOUCHER_DISCOUNT_TYPE_OPTIONS = [
  { value: 'PERCENT', label: 'Giảm theo phần trăm' },
  { value: 'FIXED', label: 'Giảm số tiền' },
] as const satisfies ReadonlyArray<{ value: VoucherDiscountType; label: string }>;

export const VOUCHER_SCOPE_OPTIONS = [
  { value: 'ORDER', label: 'Toàn bộ đơn hàng' },
  { value: 'PRODUCT_TYPE', label: 'Dòng sản phẩm' },
  { value: 'PRODUCTS', label: 'Sản phẩm cụ thể' },
  { value: 'VARIANTS', label: 'Biến thể cụ thể' },
] as const satisfies ReadonlyArray<{ value: VoucherScopeType; label: string }>;

export const VOUCHER_VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'ACCOUNT_ONLY', label: 'Chỉ dành cho tài khoản' },
] as const satisfies ReadonlyArray<{ value: VoucherVisibility; label: string }>;

export const VOUCHER_PRODUCT_TYPE_OPTIONS = [
  { value: 'IPHONE', label: 'iPhone' },
  { value: 'ACCESSORY', label: 'Phụ kiện' },
] as const satisfies ReadonlyArray<{ value: VoucherProductType; label: string }>;

export const VOUCHER_USAGE_STATUS_OPTIONS = [
  { value: 'RESERVED', label: 'Đang chờ' },
  { value: 'CONSUMED', label: 'Đã dùng' },
  { value: 'RELEASED', label: 'Đã hoàn lại' },
] as const satisfies ReadonlyArray<{ value: VoucherUsageStatus; label: string }>;

export class VoucherAdminError extends Error {
  public constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'VoucherAdminError';
  }

  public get requiresRefetch(): boolean {
    return this.code === 'INVALID_STATE_TRANSITION' || this.code === 'CONCURRENT_MODIFICATION';
  }
}

export async function listVouchers(
  client: VoucherApiClient,
  query: VoucherQuery,
): Promise<VoucherPage<Voucher>> {
  const result = await client.GET('/api/v1/backoffice/vouchers', {
    params: { query: compactVoucherQuery(query) },
  });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể tải danh sách mã ưu đãi.');
  }
  return pageFrom(result.data.data, result.data.meta, query);
}

/** Coverage-contract name retained for callers that mirror the operation id. */
export const listBackofficeVouchers = listVouchers;

export async function getVoucher(client: VoucherApiClient, id: string): Promise<Voucher> {
  const result = await client.GET('/api/v1/backoffice/vouchers/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể mở mã ưu đãi này.');
  }
  return result.data.data;
}

/** Coverage-contract name retained for callers that mirror the operation id. */
export const getBackofficeVoucher = getVoucher;

export async function createVoucher(
  client: VoucherApiClient,
  input: CreateVoucherInput,
): Promise<Voucher> {
  const body: GeneratedCreateVoucherInput = {
    ...input,
    code: normalizeVoucherCode(input.code),
  };
  const result = await client.POST('/api/v1/backoffice/vouchers', { body });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể tạo mã ưu đãi.');
  }
  return result.data.data;
}

export async function updateVoucher(
  client: VoucherApiClient,
  id: string,
  input: UpdateVoucherInput,
): Promise<Voucher> {
  const result = await client.PATCH('/api/v1/backoffice/vouchers/{id}', {
    params: { path: { id } },
    body: input as GeneratedUpdateVoucherInput,
  });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể lưu thay đổi của mã ưu đãi.');
  }
  return result.data.data;
}

export async function activateVoucher(client: VoucherApiClient, id: string): Promise<Voucher> {
  const result = await client.POST('/api/v1/backoffice/vouchers/{id}/activate', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể mở áp dụng mã ưu đãi.');
  }
  return result.data.data;
}

export async function pauseVoucher(
  client: VoucherApiClient,
  id: string,
  reason: string,
): Promise<Voucher> {
  return reasonCommand(client, id, 'pause', reason);
}

export async function archiveVoucher(
  client: VoucherApiClient,
  id: string,
  reason: string,
): Promise<Voucher> {
  return reasonCommand(client, id, 'archive', reason);
}

export async function listVoucherUsages(
  client: VoucherApiClient,
  id: string,
  query: UsageQuery,
): Promise<VoucherPage<VoucherUsage>> {
  const result = await client.GET('/api/v1/backoffice/vouchers/{id}/usages', {
    params: {
      path: { id },
      query: compactUsageQuery(query),
    },
  });
  if (result.data === undefined) {
    throw voucherAdminError(result.error, 'Không thể tải lịch sử sử dụng mã ưu đãi.');
  }
  const usages = result.data.data.map(projectVoucherUsage);
  return pageFrom(usages, result.data.meta, query);
}

export function normalizeVoucherCode(value: string): string {
  return value.trim().toUpperCase();
}

export function voucherStatusLabel(status: VoucherStatus): string {
  return optionLabel(VOUCHER_STATUS_OPTIONS, status);
}

export function voucherDiscountTypeLabel(discountType: VoucherDiscountType): string {
  return optionLabel(VOUCHER_DISCOUNT_TYPE_OPTIONS, discountType);
}

export function voucherScopeTypeLabel(scopeType: VoucherScopeType): string {
  return optionLabel(VOUCHER_SCOPE_OPTIONS, scopeType);
}

export function voucherVisibilityLabel(visibility: VoucherVisibility): string {
  return optionLabel(VOUCHER_VISIBILITY_OPTIONS, visibility);
}

export function voucherProductTypeLabel(productType: VoucherProductType): string {
  return optionLabel(VOUCHER_PRODUCT_TYPE_OPTIONS, productType);
}

export function voucherUsageStatusLabel(status: VoucherUsageStatus): string {
  return optionLabel(VOUCHER_USAGE_STATUS_OPTIONS, status);
}

export function voucherScopeSummary(voucher: Pick<Voucher, 'scopeType' | 'scopeConfig'>): string {
  switch (voucher.scopeType) {
    case 'ORDER':
      return 'Toàn bộ đơn hàng';
    case 'PRODUCT_TYPE': {
      const productType = scopeProductType(voucher.scopeConfig);
      return productType === null
        ? 'Theo dòng sản phẩm'
        : `Dòng ${voucherProductTypeLabel(productType)}`;
    }
    case 'PRODUCTS':
      return selectedCountSummary(scopeIds(voucher.scopeConfig, 'productIds'), 'sản phẩm');
    case 'VARIANTS':
      return selectedCountSummary(scopeIds(voucher.scopeConfig, 'variantIds'), 'biến thể');
  }
}

export function voucherDiscountSummary(
  voucher: Pick<Voucher, 'discountType' | 'discountValue' | 'maxDiscountAmount'>,
): string {
  if (voucher.discountType === 'FIXED') {
    return `Giảm ${formatMoney(voucher.discountValue)} ₫`;
  }
  const maximum =
    voucher.maxDiscountAmount === null || voucher.maxDiscountAmount === undefined
      ? ''
      : `, tối đa ${formatMoney(voucher.maxDiscountAmount)} ₫`;
  return `Giảm ${voucher.discountValue}%${maximum}`;
}

export function voucherUsageTotal(voucher: Pick<Voucher, 'usageCounts'>): number {
  return voucher.usageCounts.reserved + voucher.usageCounts.consumed + voucher.usageCounts.released;
}

export function voucherErrorRequiresRefetch(error: unknown): boolean {
  return error instanceof VoucherAdminError && error.requiresRefetch;
}

export function voucherAdminError(value: unknown, fallback: string): VoucherAdminError {
  const code = errorCode(value);
  return new VoucherAdminError(VOUCHER_ERROR_MESSAGES[code ?? ''] ?? fallback, code);
}

const VOUCHER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Thông tin mã ưu đãi chưa hợp lệ. Hãy kiểm tra lại các mục đã nhập.',
  MALFORMED_JSON: 'Thông tin gửi đi chưa hợp lệ. Hãy kiểm tra lại rồi thử lại.',
  DUPLICATE_RESOURCE: 'Mã ưu đãi này đã tồn tại. Hãy chọn một mã khác.',
  INVALID_STATE_TRANSITION:
    'Mã ưu đãi đã đổi trạng thái hoặc chưa đủ điều kiện. Hãy tải lại dữ liệu mới nhất.',
  CONCURRENT_MODIFICATION: 'Mã ưu đãi vừa được cập nhật. Hãy tải lại dữ liệu mới nhất.',
  RESOURCE_NOT_FOUND: 'Không tìm thấy mã ưu đãi hoặc bạn không có quyền xem.',
  FORBIDDEN: 'Chỉ quản trị viên mới có thể quản lý mã ưu đãi.',
  AUTH_REQUIRED: 'Bạn cần đăng nhập lại để tiếp tục.',
  ACCESS_TOKEN_INVALID: 'Bạn cần đăng nhập lại để tiếp tục.',
  SESSION_REVOKED: 'Bạn cần đăng nhập lại để tiếp tục.',
  CSRF_VALIDATION_FAILED: 'Không thể xác nhận thao tác. Hãy tải lại trang rồi thử lại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  SERVICE_UNAVAILABLE: 'Hệ thống đang tạm gián đoạn. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.',
};

async function reasonCommand(
  client: VoucherApiClient,
  id: string,
  command: 'pause' | 'archive',
  reason: string,
): Promise<Voucher> {
  const body = { reason: reason.trim() };
  const result =
    command === 'pause'
      ? await client.POST('/api/v1/backoffice/vouchers/{id}/pause', {
          params: { path: { id } },
          body,
        })
      : await client.POST('/api/v1/backoffice/vouchers/{id}/archive', {
          params: { path: { id } },
          body,
        });
  if (result.data === undefined) {
    throw voucherAdminError(
      result.error,
      command === 'pause' ? 'Không thể tạm dừng mã ưu đãi.' : 'Không thể lưu trữ mã ưu đãi.',
    );
  }
  return result.data.data;
}

function compactVoucherQuery(query: VoucherQuery): VoucherListApiQuery {
  const q = query.q?.trim();
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(q === undefined || q === '' ? {} : { q }),
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
    ...(query.discountType === undefined || query.discountType === ''
      ? {}
      : { discountType: query.discountType }),
    ...(query.scopeType === undefined || query.scopeType === ''
      ? {}
      : { scopeType: query.scopeType }),
    ...(query.visibility === undefined || query.visibility === ''
      ? {}
      : { visibility: query.visibility }),
  };
}

function compactUsageQuery(query: UsageQuery): VoucherUsageApiQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
    ...(query.orderId === undefined || query.orderId === '' ? {} : { orderId: query.orderId }),
    ...(query.customerId === undefined || query.customerId === ''
      ? {}
      : { customerId: query.customerId }),
  };
}

function projectVoucherUsage(usage: components['schemas']['VoucherUsageDto']): VoucherUsage {
  return {
    id: usage.id,
    orderId: usage.orderId,
    orderNumber: usage.orderNumber,
    customerName: usage.customer?.name ?? 'Khách mua không cần tài khoản',
    customerEmail: usage.customer?.email ?? null,
    status: usage.status,
    createdAt: usage.createdAt,
    consumedAt: usage.consumedAt ?? null,
    releasedAt: usage.releasedAt ?? null,
  };
}

function pageFrom<T>(
  items: T[],
  meta: unknown,
  fallback: Pick<VoucherQuery | UsageQuery, 'page' | 'pageSize'>,
): VoucherPage<T> {
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

function optionLabel<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? '';
}

function scopeProductType(value: Voucher['scopeConfig']): VoucherProductType | null {
  const candidate: unknown = value;
  if (!isRecord(candidate)) return null;
  return candidate['productType'] === 'IPHONE' || candidate['productType'] === 'ACCESSORY'
    ? candidate['productType']
    : null;
}

function scopeIds(value: Voucher['scopeConfig'], key: 'productIds' | 'variantIds'): string[] {
  const candidate: unknown = value;
  if (!isRecord(candidate) || !Array.isArray(candidate[key])) return [];
  return candidate[key].filter((entry): entry is string => typeof entry === 'string');
}

function selectedCountSummary(ids: string[], noun: string): string {
  return ids.length === 0 ? `Chưa chọn ${noun}` : `${ids.length.toString()} ${noun} đã chọn`;
}

function formatMoney(value: string): string {
  try {
    return new Intl.NumberFormat('vi-VN').format(BigInt(value));
  } catch {
    return value;
  }
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
