export type VoucherStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type VoucherUsageStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';
export type VoucherDiscountType = 'FIXED' | 'PERCENT';
export type VoucherScopeType = 'ORDER' | 'PRODUCT_TYPE' | 'PRODUCTS' | 'VARIANTS';
export type VoucherVisibility = 'PUBLIC' | 'ACCOUNT_ONLY';

export interface VoucherPresentationSource {
  readonly discountType: VoucherDiscountType;
  readonly discountValue: string;
  readonly endsAt: string;
  readonly maxDiscountAmount?: string | null;
  readonly scopeConfig?:
    | { readonly productType: 'IPHONE' | 'ACCESSORY' }
    | { readonly productIds: readonly string[] }
    | { readonly variantIds: readonly string[] }
    | null;
  readonly scopeType: VoucherScopeType;
  readonly startsAt: string;
  readonly visibility: VoucherVisibility;
}

const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
});

const MONEY_FORMAT = new Intl.NumberFormat('vi-VN', {
  currency: 'VND',
  maximumFractionDigits: 0,
  style: 'currency',
});

export function voucherStatusLabel(status: VoucherStatus): string {
  if (status === 'ACTIVE') return 'Đang áp dụng';
  if (status === 'DRAFT') return 'Bản nháp';
  if (status === 'PAUSED') return 'Tạm dừng';
  return 'Đã lưu trữ';
}

export function voucherUsageStatusLabel(status: VoucherUsageStatus): string {
  if (status === 'CONSUMED') return 'Đã dùng';
  if (status === 'RESERVED') return 'Đang chờ';
  return 'Đã hoàn lại';
}

export function voucherDiscountSummary(
  voucher: Pick<VoucherPresentationSource, 'discountType' | 'discountValue' | 'maxDiscountAmount'>,
): string {
  if (voucher.discountType === 'FIXED') return `Giảm ${formatVoucherMoney(voucher.discountValue)}`;

  const base = `Giảm ${voucher.discountValue}%`;
  return voucher.maxDiscountAmount === null || voucher.maxDiscountAmount === undefined
    ? base
    : `${base} · tối đa ${formatVoucherMoney(voucher.maxDiscountAmount)}`;
}

export function voucherScopeSummary(
  voucher: Pick<VoucherPresentationSource, 'scopeConfig' | 'scopeType'>,
): string {
  if (voucher.scopeType === 'ORDER') return 'Toàn bộ đơn hàng';

  const scope = voucher.scopeConfig;
  if (voucher.scopeType === 'PRODUCT_TYPE' && scope !== null && scope !== undefined) {
    if ('productType' in scope) return scope.productType === 'IPHONE' ? 'Dòng iPhone' : 'Phụ kiện';
  }
  if (voucher.scopeType === 'PRODUCTS' && scope !== null && scope !== undefined) {
    if ('productIds' in scope) return `${String(scope.productIds.length)} sản phẩm được chọn`;
  }
  if (voucher.scopeType === 'VARIANTS' && scope !== null && scope !== undefined) {
    if ('variantIds' in scope) return `${String(scope.variantIds.length)} biến thể được chọn`;
  }
  return 'Phạm vi đang được cập nhật';
}

export function voucherVisibilityLabel(visibility: VoucherVisibility): string {
  return visibility === 'PUBLIC' ? 'Công khai' : 'Chỉ dành cho tài khoản';
}

export function formatVoucherDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

export function formatVoucherDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMAT.format(date);
}

export function formatVoucherDateRange(startsAt: string, endsAt: string): string {
  return `${formatVoucherDate(startsAt)}–${formatVoucherDate(endsAt)}`;
}

export function formatVoucherMoney(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? MONEY_FORMAT.format(amount) : '—';
}

export function voucherUsageProgress(consumed: number, limit: number | null | undefined): number {
  if (limit === null || limit === undefined || limit <= 0) return 0;
  return Math.min(100, Math.max(0, (consumed / limit) * 100));
}
