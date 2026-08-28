export type CatalogProductType = 'IPHONE' | 'ACCESSORY';
export type CatalogRecordStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface CatalogQueryState {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly type?: CatalogProductType;
  readonly status?: CatalogRecordStatus;
  readonly releaseYear?: number;
  readonly sortBy: 'createdAt' | 'updatedAt' | 'name' | 'releaseYear';
  readonly sortOrder: 'asc' | 'desc';
}

export type CatalogQueryOverrides = {
  readonly [Key in keyof CatalogQueryState]?: CatalogQueryState[Key] | undefined;
};

export interface CatalogProductDraft {
  readonly brand: string;
  readonly chipset: string;
  readonly description: string;
  readonly name: string;
  readonly ramGb: string;
  readonly releaseYear: string;
  readonly screenSizeInches: string;
  readonly seoDescription: string;
  readonly seoTitle: string;
  readonly slug: string;
  readonly type: CatalogProductType;
  readonly warrantyPolicyId: string;
}

export interface CatalogProductInput {
  readonly brand: string;
  readonly chipset?: string;
  readonly description?: string;
  readonly name: string;
  readonly ramGb?: number;
  readonly releaseYear?: number;
  readonly screenSizeInches?: string;
  readonly seoDescription?: string;
  readonly seoTitle?: string;
  readonly slug: string;
  readonly type: CatalogProductType;
  readonly warrantyPolicyId?: string;
}

export interface CatalogValidationError {
  readonly field: keyof CatalogProductDraft;
  readonly message: string;
}

export const CATALOG_PAGE_SIZE = 6;

export const EMPTY_PRODUCT_DRAFT: CatalogProductDraft = {
  brand: 'Apple',
  chipset: '',
  description: '',
  name: '',
  ramGb: '',
  releaseYear: '',
  screenSizeInches: '',
  seoDescription: '',
  seoTitle: '',
  slug: '',
  type: 'IPHONE',
  warrantyPolicyId: '',
};

export function catalogProductTypeLabel(type: CatalogProductType): string {
  return type === 'IPHONE' ? 'iPhone' : 'Phụ kiện';
}

export function catalogStatusLabel(status: CatalogRecordStatus): string {
  if (status === 'ACTIVE') return 'Đang bán';
  if (status === 'ARCHIVED') return 'Đã lưu trữ';
  return 'Bản nháp';
}

export function catalogStatusCountLabel(status: CatalogRecordStatus): string {
  if (status === 'ACTIVE') return 'Đang bán';
  if (status === 'ARCHIVED') return 'Đã lưu trữ';
  return 'Bản nháp';
}

export function catalogSortLabel(
  sortBy: CatalogQueryState['sortBy'],
  sortOrder: CatalogQueryState['sortOrder'],
): string {
  if (sortBy === 'name') return sortOrder === 'asc' ? 'Tên từ A đến Z' : 'Tên từ Z đến A';
  if (sortBy === 'releaseYear') {
    return sortOrder === 'desc' ? 'Năm ra mắt mới nhất' : 'Năm ra mắt cũ nhất';
  }
  if (sortBy === 'createdAt') return sortOrder === 'desc' ? 'Tạo mới nhất' : 'Tạo cũ nhất';
  return sortOrder === 'desc' ? 'Cập nhật mới nhất' : 'Cập nhật cũ nhất';
}

export function catalogQueryFromSearchParams(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): CatalogQueryState {
  const page = positiveInteger(firstValue(searchParams['page'])) ?? 1;
  const q = firstValue(searchParams['q'])?.trim();
  const type = catalogProductType(firstValue(searchParams['type']));
  const status = catalogRecordStatus(firstValue(searchParams['status']));
  const releaseYear = yearValue(firstValue(searchParams['releaseYear']));
  const sortBy = catalogSortField(firstValue(searchParams['sortBy']));
  const sortOrder = firstValue(searchParams['sortOrder']) === 'asc' ? 'asc' : 'desc';

  return {
    page,
    pageSize: CATALOG_PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(q === undefined || q === '' ? {} : { q }),
    ...(type === undefined ? {} : { type }),
    ...(status === undefined ? {} : { status }),
    ...(releaseYear === undefined ? {} : { releaseYear }),
  };
}

export function buildCatalogListHref(
  query: CatalogQueryState,
  overrides: CatalogQueryOverrides,
): string {
  const q = Object.hasOwn(overrides, 'q') ? overrides.q : query.q;
  const type = Object.hasOwn(overrides, 'type') ? overrides.type : query.type;
  const status = Object.hasOwn(overrides, 'status') ? overrides.status : query.status;
  const releaseYear = Object.hasOwn(overrides, 'releaseYear')
    ? overrides.releaseYear
    : query.releaseYear;
  const next: CatalogQueryState = {
    page: overrides.page ?? query.page,
    pageSize: overrides.pageSize ?? query.pageSize,
    sortBy: overrides.sortBy ?? query.sortBy,
    sortOrder: overrides.sortOrder ?? query.sortOrder,
    ...(q === undefined ? {} : { q }),
    ...(type === undefined ? {} : { type }),
    ...(status === undefined ? {} : { status }),
    ...(releaseYear === undefined ? {} : { releaseYear }),
  };
  const params = new URLSearchParams();
  if (next.page > 1) params.set('page', String(next.page));
  if (next.q !== undefined && next.q.trim() !== '') params.set('q', next.q.trim());
  if (next.type !== undefined) params.set('type', next.type);
  if (next.status !== undefined) params.set('status', next.status);
  if (next.releaseYear !== undefined) params.set('releaseYear', String(next.releaseYear));
  if (next.sortBy !== 'updatedAt') params.set('sortBy', next.sortBy);
  if (next.sortOrder !== 'desc') params.set('sortOrder', next.sortOrder);
  const encoded = params.toString();
  return `/backoffice/catalog/products${encoded === '' ? '' : `?${encoded}`}`;
}

export function slugFromProductName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function catalogDisplayCode(slug: string): string {
  return slug
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export function validateCatalogProductDraft(
  draft: CatalogProductDraft,
): readonly CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];
  if (draft.name.trim() === '') errors.push({ field: 'name', message: 'Nhập tên sản phẩm.' });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug.trim())) {
    errors.push({
      field: 'slug',
      message: 'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.',
    });
  }
  if (draft.brand.trim() === '') errors.push({ field: 'brand', message: 'Chọn thương hiệu.' });
  if (draft.description.trim() === '') {
    errors.push({ field: 'description', message: 'Nhập mô tả ngắn cho sản phẩm.' });
  }
  if (draft.warrantyPolicyId === '') {
    errors.push({ field: 'warrantyPolicyId', message: 'Chọn chính sách bảo hành.' });
  }

  if (draft.type === 'IPHONE') {
    validateIntegerRange(draft.releaseYear, 2007, 2100, 'releaseYear', 'năm ra mắt', errors);
    validateIntegerRange(draft.ramGb, 1, 64, 'ramGb', 'dung lượng RAM', errors);
    if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(draft.screenSizeInches.trim())) {
      errors.push({
        field: 'screenSizeInches',
        message: 'Nhập kích thước màn hình hợp lệ, ví dụ 6.3.',
      });
    }
    if (draft.chipset.trim() === '') {
      errors.push({ field: 'chipset', message: 'Nhập tên bộ xử lý.' });
    }
  }

  if (draft.seoTitle.trim().length > 255) {
    errors.push({ field: 'seoTitle', message: 'Tiêu đề tìm kiếm tối đa 255 ký tự.' });
  }
  return errors;
}

export function catalogProductInputFromDraft(draft: CatalogProductDraft): CatalogProductInput {
  return {
    brand: draft.brand.trim(),
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    type: draft.type,
    ...(draft.description.trim() === '' ? {} : { description: draft.description.trim() }),
    ...(draft.warrantyPolicyId === '' ? {} : { warrantyPolicyId: draft.warrantyPolicyId }),
    ...(draft.seoTitle.trim() === '' ? {} : { seoTitle: draft.seoTitle.trim() }),
    ...(draft.seoDescription.trim() === '' ? {} : { seoDescription: draft.seoDescription.trim() }),
    ...(draft.type === 'ACCESSORY'
      ? {}
      : {
          chipset: draft.chipset.trim(),
          ramGb: Number(draft.ramGb),
          releaseYear: Number(draft.releaseYear),
          screenSizeInches: draft.screenSizeInches.trim(),
        }),
  };
}

export function formatCatalogDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có ngày cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatCatalogDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có thời gian cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatCatalogMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^\d+$/.test(value)) return 'Chưa đặt giá';
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) return 'Chưa đặt giá';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function validateIntegerRange(
  value: string,
  min: number,
  max: number,
  field: CatalogValidationError['field'],
  label: string,
  errors: CatalogValidationError[],
) {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push({ field, message: `Nhập ${label} từ ${String(min)} đến ${String(max)}.` });
  }
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function yearValue(value: string | undefined): number | undefined {
  const parsed = positiveInteger(value);
  return parsed !== undefined && parsed >= 2007 && parsed <= 2100 ? parsed : undefined;
}

function catalogProductType(value: string | undefined): CatalogProductType | undefined {
  return value === 'IPHONE' || value === 'ACCESSORY' ? value : undefined;
}

function catalogRecordStatus(value: string | undefined): CatalogRecordStatus | undefined {
  return value === 'DRAFT' || value === 'ACTIVE' || value === 'ARCHIVED' ? value : undefined;
}

function catalogSortField(value: string | undefined): CatalogQueryState['sortBy'] {
  if (value === 'createdAt' || value === 'name' || value === 'releaseYear') return value;
  return 'updatedAt';
}
