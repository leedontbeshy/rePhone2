import type { CatalogProductListItem, CatalogProductPage } from '@/lib/backoffice-catalog-api';
import {
  voucherUsageTotal,
  type CreateVoucherInput,
  type UpdateVoucherInput,
  type Voucher,
} from '@/lib/backoffice-voucher-api';

export const VOUCHER_PRODUCT_PAGE_SIZE = 100;
export const VOUCHER_PRODUCT_MAX_PAGES = 100;

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
