import type { CatalogProductListItem, CatalogProductPage } from '@/lib/backoffice-catalog-api';
import {
  voucherUsageTotal,
  type CreateVoucherInput,
  type UpdateVoucherInput,
  type Voucher,
} from '@/lib/backoffice-voucher-api';

export const VOUCHER_PRODUCT_PAGE_SIZE = 100;
export const VOUCHER_PRODUCT_MAX_PAGES = 100;
export const VIETNAM_TIME_ZONE_LABEL = 'giờ Việt Nam';

const VIETNAM_UTC_OFFSET_MILLISECONDS = 7 * 60 * 60 * 1_000;
const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type VoucherProductPageLoader = (page: number, pageSize: number) => Promise<CatalogProductPage>;

export function voucherAllowsOnlyEndDateUpdate(voucher: Voucher): boolean {
  return voucher.status === 'PAUSED' && voucherUsageTotal(voucher) > 0;
}

export function voucherUpdateFromEditor(
  voucher: Voucher,
  input: CreateVoucherInput,
): UpdateVoucherInput {
  if (voucherAllowsOnlyEndDateUpdate(voucher)) {
    return { endsAt: input.endsAt };
  }

  if (voucher.status === 'ACTIVE') {
    return {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
    };
  }

  const { code, ...update } = input;
  void code;
  return update;
}

export function voucherEndDateExtensionError(
  currentEndsAt: string,
  nextEndsAt: string,
): string | null {
  const currentTime = new Date(currentEndsAt).getTime();
  const nextTime = new Date(nextEndsAt).getTime();
  if (!Number.isFinite(nextTime)) return 'Thời gian kết thúc chưa hợp lệ.';
  if (Number.isFinite(currentTime) && nextTime < currentTime) {
    return 'Thời gian kết thúc mới không được sớm hơn thời gian hiện tại.';
  }
  return null;
}

export function voucherIsoToVietnamDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + VIETNAM_UTC_OFFSET_MILLISECONDS).toISOString().slice(0, 16);
}

export function voucherVietnamDateTimeLocalToIso(value: string): string | null {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour - 7, minute, 0, 0);
  if (Number.isNaN(instant.getTime())) return null;
  const roundTrip = voucherIsoToVietnamDateTimeLocal(instant.toISOString());
  return roundTrip === value ? instant.toISOString() : null;
}

export function validVoucherVariantSelection({
  activeVariantIds,
  initialVariantIds,
  loadedProductId,
  selectedProductId,
  selectedVariantIds,
}: Readonly<{
  activeVariantIds: readonly string[];
  initialVariantIds: readonly string[];
  loadedProductId: string | null;
  selectedProductId: string;
  selectedVariantIds: readonly string[];
}>): string[] | null {
  if (selectedVariantIds.length === 0) return null;
  if (selectedProductId === '') {
    return sameIds(selectedVariantIds, initialVariantIds) ? [...selectedVariantIds] : null;
  }
  if (loadedProductId !== selectedProductId) return null;
  const allowed = new Set(activeVariantIds);
  return selectedVariantIds.every((id) => allowed.has(id)) ? [...selectedVariantIds] : null;
}

export async function loadAllVoucherCatalogProducts(
  loadPage: VoucherProductPageLoader,
  options: Readonly<{
    maximumPages?: number;
    pageSize?: number;
  }> = {},
): Promise<CatalogProductListItem[]> {
  const maximumPages = options.maximumPages ?? VOUCHER_PRODUCT_MAX_PAGES;
  const pageSize = options.pageSize ?? VOUCHER_PRODUCT_PAGE_SIZE;
  const productsById = new Map<string, CatalogProductListItem>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (page > maximumPages) throw tooManyProductsError();
    const result = await loadPage(page, pageSize);
    for (const product of result.data) productsById.set(product.id, product);

    const reportedTotalPages = Math.max(0, Math.trunc(result.pagination.totalPages));
    if (reportedTotalPages > maximumPages) throw tooManyProductsError();
    totalPages = Math.max(totalPages, reportedTotalPages);
    page += 1;
  }

  return [...productsById.values()];
}

function tooManyProductsError(): Error {
  return new Error('Danh sách sản phẩm đang bán quá lớn để hiển thị đầy đủ. Vui lòng thử lại sau.');
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
