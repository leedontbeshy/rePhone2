import { type components, type createApiClient, type paths } from '@rephone/api-client';

export type CatalogApiClient = ReturnType<typeof createApiClient>;

type ApiProductListQuery = NonNullable<
  paths['/api/v1/backoffice/products']['get']['parameters']['query']
>;
type ApiCreateProduct =
  paths['/api/v1/backoffice/products']['post']['requestBody']['content']['application/json'];
type ApiUpdateProduct =
  paths['/api/v1/backoffice/products/{id}']['patch']['requestBody']['content']['application/json'];
type ApiCreateVariant =
  paths['/api/v1/backoffice/products/{productId}/variants']['post']['requestBody']['content']['application/json'];
type ApiUpdateVariant =
  paths['/api/v1/backoffice/variants/{id}']['patch']['requestBody']['content']['application/json'];
type ApiUpdateMedia =
  paths['/api/v1/backoffice/product-media/{id}']['patch']['requestBody']['content']['application/json'];
type ApiUploadMedia =
  paths['/api/v1/backoffice/products/{id}/media']['post']['requestBody']['content']['multipart/form-data'];

type ApiProductListItem = components['schemas']['BackofficeProductListItemDto'];
type ApiProductDetail = components['schemas']['BackofficeProductDetailDto'];
type ApiVariant = components['schemas']['BackofficeVariantDto'];
type ApiMediaSummary = components['schemas']['BackofficeMediaSummaryDto'];
type ApiMedia = components['schemas']['ProductMediaDto'];

export type CatalogProductType = 'iphone' | 'accessory';
export type CatalogStatus = 'draft' | 'active' | 'archived';
export type CatalogInventoryMode = 'serialized' | 'quantity';

export interface CatalogMedia {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface CatalogProductListItem {
  id: string;
  type: CatalogProductType;
  typeLabel: string;
  brand: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  statusLabel: string;
  releaseYear: number | null;
  variantCount: number;
  primaryMedia: CatalogMedia | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogAttribute {
  name: string;
  value: string;
}

export interface CatalogVariant {
  id: string;
  productId: string;
  sku: string;
  displayName: string;
  storageCapacityGb: number | null;
  colorName: string | null;
  colorHex: string | null;
  inventoryMode: CatalogInventoryMode;
  inventoryModeLabel: string;
  salePrice: string | null;
  compareAtPrice: string | null;
  attributes: CatalogAttribute[];
  warrantyPolicyId: string | null;
  status: CatalogStatus;
  statusLabel: string;
  media: CatalogMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductDetail extends CatalogProductListItem {
  description: string | null;
  chipset: string | null;
  ramGb: number | null;
  screenSizeInches: string | null;
  warrantyPolicyId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  archivedAt: string | null;
  variants: CatalogVariant[];
  media: CatalogMedia[];
}

export interface CatalogPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CatalogProductPage {
  data: CatalogProductListItem[];
  pagination: CatalogPagination;
}

export interface CatalogProductListQuery {
  search?: string;
  type?: CatalogProductType | '';
  status?: CatalogStatus | '';
  releaseYear?: number;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'updatedAt' | 'name' | 'releaseYear';
  sortOrder: 'asc' | 'desc';
}

export interface CreateCatalogProductInput {
  type: CatalogProductType;
  brand?: string;
  name: string;
  slug: string;
  description?: string | null;
  releaseYear?: number;
  chipset?: string;
  ramGb?: number;
  screenSizeInches?: string;
  warrantyPolicyId?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface UpdateCatalogProductInput {
  type?: CatalogProductType;
  brand?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  releaseYear?: number;
  chipset?: string;
  ramGb?: number;
  screenSizeInches?: string;
  warrantyPolicyId?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface CatalogVariantInput {
  sku: string;
  displayName: string;
  storageCapacityGb?: number;
  colorName?: string;
  colorHex?: string;
  salePrice?: string;
  compareAtPrice?: string;
  attributes?: CatalogAttribute[];
  warrantyPolicyId?: string;
}

export type UpdateCatalogVariantInput = Partial<CatalogVariantInput>;

export interface CatalogMediaUploadInput {
  file: Blob;
  altText?: string;
  sortOrder?: number;
}

export interface CatalogMediaUpdateInput {
  altText?: string | null;
  sortOrder?: number;
}

export interface CatalogWarrantyOption {
  value: string;
  label: string;
  name: string;
  code: string;
  defaultDays: number;
}

export class BackofficeCatalogError extends Error {
  public constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'BackofficeCatalogError';
  }

  public get requiresRefetch(): boolean {
    return (
      this.code === 'CONCURRENT_MODIFICATION' ||
      this.code === 'INVALID_STATE_TRANSITION' ||
      this.code === 'RESOURCE_NOT_FOUND'
    );
  }
}

export const CATALOG_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CATALOG_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export function validateCatalogMediaFile(file: Blob): string | null {
  if (file.size === 0) return 'Tệp ảnh đang trống.';
  if (file.size > CATALOG_MEDIA_MAX_BYTES) return 'Ảnh vượt quá giới hạn 8 MB.';
  if (!(CATALOG_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.';
  }
  return null;
}

export async function listCatalogProducts(
  client: CatalogApiClient,
  query: CatalogProductListQuery,
): Promise<CatalogProductPage> {
  const apiQuery: ApiProductListQuery = {
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...(query.search === undefined || query.search.trim() === ''
      ? {}
      : { q: query.search.trim() }),
    ...(query.type === undefined || query.type === '' ? {} : { type: toApiProductType(query.type) }),
    ...(query.status === undefined || query.status === ''
      ? {}
      : { status: toApiStatus(query.status) }),
    ...(query.releaseYear === undefined ? {} : { releaseYear: query.releaseYear }),
  };
  const result = await client.GET('/api/v1/backoffice/products', {
    params: { query: apiQuery },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể tải danh sách sản phẩm.');
  }
  const pagination = result.data.meta.pagination;
  return {
    data: result.data.data.map(toProductListItem),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: pagination.totalItems,
      totalPages: pagination.totalPages,
    },
  };
}

export async function getCatalogProduct(
  client: CatalogApiClient,
  productId: string,
): Promise<CatalogProductDetail> {
  const result = await client.GET('/api/v1/backoffice/products/{id}', {
    params: { path: { id: productId } },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể mở chi tiết sản phẩm.');
  }
  return toProductDetail(result.data.data);
}

export async function createCatalogProduct(
  client: CatalogApiClient,
  input: CreateCatalogProductInput,
): Promise<CatalogProductDetail> {
  const body: ApiCreateProduct = {
    ...input,
    type: toApiProductType(input.type),
    brand: input.brand ?? 'Apple',
  };
  const result = await client.POST('/api/v1/backoffice/products', { body });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể tạo sản phẩm.');
  }
  return toProductDetail(result.data.data);
}

export async function updateCatalogProduct(
  client: CatalogApiClient,
  productId: string,
  input: UpdateCatalogProductInput,
): Promise<CatalogProductDetail> {
  const { type, ...fields } = input;
  const body: ApiUpdateProduct = {
    ...fields,
    ...(type === undefined ? {} : { type: toApiProductType(type) }),
  };
  const result = await client.PATCH('/api/v1/backoffice/products/{id}', {
    params: { path: { id: productId } },
    body,
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể cập nhật sản phẩm.');
  }
  return toProductDetail(result.data.data);
}

export async function publishCatalogProduct(
  client: CatalogApiClient,
  productId: string,
): Promise<CatalogProductDetail> {
  const result = await client.POST('/api/v1/backoffice/products/{id}/publish', {
    params: { path: { id: productId } },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể đưa sản phẩm lên bán.');
  }
  return toProductDetail(result.data.data);
}

export async function archiveCatalogProduct(
  client: CatalogApiClient,
  productId: string,
  reason: string,
): Promise<CatalogProductDetail> {
  const result = await client.POST('/api/v1/backoffice/products/{id}/archive', {
    params: { path: { id: productId } },
    body: { reason },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể ngừng kinh doanh sản phẩm.');
  }
  return toProductDetail(result.data.data);
}

export async function createCatalogVariant(
  client: CatalogApiClient,
  productId: string,
  input: CatalogVariantInput,
): Promise<CatalogVariant> {
  const result = await client.POST('/api/v1/backoffice/products/{productId}/variants', {
    params: { path: { productId } },
    body: toApiCreateVariant(input),
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể thêm phiên bản sản phẩm.');
  }
  return toVariant(result.data.data);
}

export async function updateCatalogVariant(
  client: CatalogApiClient,
  variantId: string,
  input: UpdateCatalogVariantInput,
): Promise<CatalogVariant> {
  const result = await client.PATCH('/api/v1/backoffice/variants/{id}', {
    params: { path: { id: variantId } },
    body: toApiUpdateVariant(input),
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể cập nhật phiên bản sản phẩm.');
  }
  return toVariant(result.data.data);
}

export async function activateCatalogVariant(
  client: CatalogApiClient,
  variantId: string,
): Promise<CatalogVariant> {
  const result = await client.POST('/api/v1/backoffice/variants/{id}/activate', {
    params: { path: { id: variantId } },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể mở bán phiên bản này.');
  }
  return toVariant(result.data.data);
}

export async function archiveCatalogVariant(
  client: CatalogApiClient,
  variantId: string,
  reason: string,
): Promise<CatalogVariant> {
  const result = await client.POST('/api/v1/backoffice/variants/{id}/archive', {
    params: { path: { id: variantId } },
    body: { reason },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể ngừng kinh doanh phiên bản này.');
  }
  return toVariant(result.data.data);
}

export function uploadCatalogProductMedia(
  client: CatalogApiClient,
  productId: string,
  input: CatalogMediaUploadInput,
): Promise<CatalogMedia> {
  return uploadMedia(client, 'product', productId, input);
}

export function uploadCatalogVariantMedia(
  client: CatalogApiClient,
  variantId: string,
  input: CatalogMediaUploadInput,
): Promise<CatalogMedia> {
  return uploadMedia(client, 'variant', variantId, input);
}

export function updateCatalogProductMedia(
  client: CatalogApiClient,
  mediaId: string,
  input: CatalogMediaUpdateInput,
): Promise<CatalogMedia> {
  return updateMedia(client, mediaId, input);
}

export function updateCatalogVariantMedia(
  client: CatalogApiClient,
  mediaId: string,
  input: CatalogMediaUpdateInput,
): Promise<CatalogMedia> {
  return updateMedia(client, mediaId, input);
}

export function deleteCatalogProductMedia(
  client: CatalogApiClient,
  mediaId: string,
): Promise<void> {
  return deleteMedia(client, mediaId);
}

export function deleteCatalogVariantMedia(
  client: CatalogApiClient,
  mediaId: string,
): Promise<void> {
  return deleteMedia(client, mediaId);
}

export async function listCatalogWarrantyOptions(
  client: CatalogApiClient,
  search?: string,
): Promise<CatalogWarrantyOption[]> {
  const result = await client.GET('/api/v1/backoffice/warranty-policies', {
    params: {
      query: {
        page: 1,
        pageSize: 100,
        status: 'ACTIVE',
        archived: false,
        ...(search === undefined || search.trim() === '' ? {} : { q: search.trim() }),
      },
    },
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể tải lựa chọn bảo hành.');
  }
  return result.data.data.map((policy) => ({
    value: policy.id,
    label: `${policy.name} · ${String(policy.defaultDays)} ngày`,
    name: policy.name,
    code: policy.code,
    defaultDays: policy.defaultDays,
  }));
}

export function catalogError(value: unknown, fallback: string): BackofficeCatalogError {
  const code = errorCode(value);
  const detailCode = validationDetailCode(value);
  const detailMessage = detailCode === undefined ? undefined : VALIDATION_MESSAGES[detailCode];
  const message =
    detailMessage ??
    (code === undefined ? undefined : ERROR_MESSAGES[code]) ??
    fallback;
  return new BackofficeCatalogError(message, code);
}

async function uploadMedia(
  client: CatalogApiClient,
  owner: 'product' | 'variant',
  ownerId: string,
  input: CatalogMediaUploadInput,
): Promise<CatalogMedia> {
  const body: ApiUploadMedia = {
    file: input.file,
    ...(input.altText === undefined || input.altText.trim() === ''
      ? {}
      : { altText: input.altText.trim() }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  };
  const formData = new FormData();
  formData.set('file', input.file);
  if (body.altText !== undefined) formData.set('altText', body.altText);
  if (body.sortOrder !== undefined) formData.set('sortOrder', String(body.sortOrder));

  const result =
    owner === 'product'
      ? await client.POST('/api/v1/backoffice/products/{id}/media', {
          params: { path: { id: ownerId } },
          body,
          bodySerializer: () => formData,
        })
      : await client.POST('/api/v1/backoffice/variants/{id}/media', {
          params: { path: { id: ownerId } },
          body,
          bodySerializer: () => formData,
        });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể tải ảnh lên.');
  }
  return toUploadedMedia(result.data.data);
}

async function updateMedia(
  client: CatalogApiClient,
  mediaId: string,
  input: CatalogMediaUpdateInput,
): Promise<CatalogMedia> {
  const body: ApiUpdateMedia = input;
  const result = await client.PATCH('/api/v1/backoffice/product-media/{id}', {
    params: { path: { id: mediaId } },
    body,
  });
  if (result.data === undefined) {
    throw catalogError(result.error, 'Không thể cập nhật thông tin ảnh.');
  }
  return toUploadedMedia(result.data.data);
}

async function deleteMedia(client: CatalogApiClient, mediaId: string): Promise<void> {
  const result = await client.DELETE('/api/v1/backoffice/product-media/{id}', {
    params: { path: { id: mediaId } },
  });
  if (result.error !== undefined) {
    throw catalogError(result.error, 'Không thể xóa ảnh.');
  }
}

function toProductListItem(product: ApiProductListItem): CatalogProductListItem {
  const type = fromApiProductType(product.type);
  const status = fromApiStatus(product.status);
  return {
    id: product.id,
    type,
    typeLabel: productTypeLabel(type),
    brand: product.brand,
    name: product.name,
    slug: product.slug,
    status,
    statusLabel: productStatusLabel(status),
    releaseYear: product.releaseYear ?? null,
    variantCount: product.variantCount,
    primaryMedia: product.primaryMedia === null ? null : toMediaSummary(product.primaryMedia),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toProductDetail(product: ApiProductDetail): CatalogProductDetail {
  return {
    ...toProductListItem(product),
    description: product.description ?? null,
    chipset: product.chipset ?? null,
    ramGb: product.ramGb ?? null,
    screenSizeInches: product.screenSizeInches ?? null,
    warrantyPolicyId: product.warrantyPolicyId ?? null,
    seoTitle: product.seoTitle ?? null,
    seoDescription: product.seoDescription ?? null,
    archivedAt: product.archivedAt ?? null,
    variants: product.variants.map(toVariant),
    media: product.media.map(toMediaSummary),
  };
}

function toVariant(variant: ApiVariant): CatalogVariant {
  const status = fromApiStatus(variant.status);
  const inventoryMode = fromApiInventoryMode(variant.inventoryMode);
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    displayName: variant.displayName,
    storageCapacityGb: variant.storageCapacityGb ?? null,
    colorName: variant.colorName ?? null,
    colorHex: variant.colorHex ?? null,
    inventoryMode,
    inventoryModeLabel: inventoryMode === 'serialized' ? 'Theo từng máy' : 'Theo số lượng',
    salePrice: variant.salePrice ?? null,
    compareAtPrice: variant.compareAtPrice ?? null,
    attributes: toAttributes(variant.accessoryAttributes),
    warrantyPolicyId: variant.warrantyPolicyId ?? null,
    status,
    statusLabel: variantStatusLabel(status),
    media: variant.media.map(toMediaSummary),
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

function toMediaSummary(media: ApiMediaSummary): CatalogMedia {
  return {
    id: media.id,
    url: media.url,
    altText: media.altText ?? null,
    sortOrder: media.sortOrder,
  };
}

function toUploadedMedia(media: ApiMedia): CatalogMedia {
  return {
    id: media.id,
    url: media.url,
    altText: media.altText ?? null,
    sortOrder: media.sortOrder,
  };
}

function toApiCreateVariant(input: CatalogVariantInput): ApiCreateVariant {
  const { attributes, ...fields } = input;
  return {
    ...fields,
    ...(attributes === undefined
      ? {}
      : { accessoryAttributes: attributesToRecord(attributes) }),
  };
}

function toApiUpdateVariant(input: UpdateCatalogVariantInput): ApiUpdateVariant {
  const { attributes, ...fields } = input;
  return {
    ...fields,
    ...(attributes === undefined
      ? {}
      : { accessoryAttributes: attributesToRecord(attributes) }),
  };
}

function attributesToRecord(attributes: CatalogAttribute[]): Record<string, string> {
  return Object.fromEntries(
    attributes
      .map((attribute) => [attribute.name.trim(), attribute.value.trim()] as const)
      .filter(([name]) => name.length > 0),
  );
}

function toAttributes(value: unknown): CatalogAttribute[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, attribute]) => {
    const formatted = attributeValue(attribute);
    return formatted === null ? [] : [{ name, value: formatted }];
  });
}

function attributeValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value.flatMap((item) => {
      const formatted = attributeValue(item);
      return formatted === null ? [] : [formatted];
    });
    return values.length === 0 ? null : values.join(', ');
  }
  return null;
}

function toApiProductType(type: CatalogProductType): 'IPHONE' | 'ACCESSORY' {
  return type === 'iphone' ? 'IPHONE' : 'ACCESSORY';
}

function fromApiProductType(type: 'IPHONE' | 'ACCESSORY'): CatalogProductType {
  return type === 'IPHONE' ? 'iphone' : 'accessory';
}

function toApiStatus(status: CatalogStatus): 'DRAFT' | 'ACTIVE' | 'ARCHIVED' {
  if (status === 'active') return 'ACTIVE';
  if (status === 'archived') return 'ARCHIVED';
  return 'DRAFT';
}

function fromApiStatus(status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'): CatalogStatus {
  if (status === 'ACTIVE') return 'active';
  if (status === 'ARCHIVED') return 'archived';
  return 'draft';
}

function fromApiInventoryMode(mode: 'SERIALIZED' | 'QUANTITY'): CatalogInventoryMode {
  return mode === 'SERIALIZED' ? 'serialized' : 'quantity';
}

function productTypeLabel(type: CatalogProductType): string {
  return type === 'iphone' ? 'iPhone' : 'Phụ kiện';
}

function productStatusLabel(status: CatalogStatus): string {
  if (status === 'active') return 'Đang bán';
  if (status === 'archived') return 'Ngừng kinh doanh';
  return 'Bản nháp';
}

function variantStatusLabel(status: CatalogStatus): string {
  if (status === 'active') return 'Đang bán';
  if (status === 'archived') return 'Đã lưu trữ';
  return 'Bản nháp';
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function validationDetailCode(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value['error']) || !Array.isArray(value['error']['details'])) {
    return undefined;
  }
  const details = value['error']['details'] as unknown[];
  const detail = details.find(
    (candidate) => isRecord(candidate) && typeof candidate['code'] === 'string',
  );
  return isRecord(detail) && typeof detail['code'] === 'string' ? detail['code'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các mục đã nhập.',
  AUTH_REQUIRED: 'Bạn cần đăng nhập để tiếp tục.',
  ACCESS_TOKEN_INVALID: 'Phiên làm việc đã hết hạn. Hãy đăng nhập lại.',
  SESSION_REVOKED: 'Phiên làm việc đã kết thúc. Hãy đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  RESOURCE_NOT_FOUND: 'Không tìm thấy dữ liệu này hoặc dữ liệu vừa được thay đổi.',
  DUPLICATE_RESOURCE: 'Mã hoặc đường dẫn này đã được sử dụng.',
  INVALID_STATE_TRANSITION: 'Trạng thái dữ liệu vừa thay đổi. Hãy tải lại trang.',
  CONCURRENT_MODIFICATION: 'Dữ liệu vừa được cập nhật. Hãy tải lại trang.',
  FILE_TOO_LARGE: 'Ảnh vượt quá giới hạn 8 MB.',
  UNSUPPORTED_FILE_TYPE: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.',
  STORAGE_UNAVAILABLE: 'Hiện chưa thể lưu ảnh. Vui lòng thử lại sau.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.',
};

const VALIDATION_MESSAGES: Readonly<Record<string, string>> = {
  FILE_REQUIRED: 'Hãy chọn một ảnh để tải lên.',
  PRODUCT_TYPE_IMMUTABLE: 'Không thể đổi loại sản phẩm sau khi đã tạo phiên bản.',
  ACTIVE_VARIANT_REQUIRED: 'Cần ít nhất một phiên bản đang bán trước khi đưa sản phẩm lên bán.',
  SKU_IMMUTABLE: 'Không thể đổi mã phiên bản sau khi phiên bản đã được mở bán.',
  SALE_PRICE_REQUIRED: 'Hãy nhập giá bán cho phụ kiện.',
  IPHONE_CONFIGURATION_REQUIRED: 'Phiên bản iPhone cần đủ dung lượng và màu sắc.',
  WARRANTY_POLICY_NOT_ACTIVE: 'Hãy chọn một chính sách bảo hành đang áp dụng.',
  ACCESSORY_PHONE_SPECS_FORBIDDEN: 'Phụ kiện không sử dụng thông số riêng của điện thoại.',
  IPHONE_VARIANT_PRICE_FORBIDDEN: 'Giá iPhone được quản lý theo từng máy, không đặt tại phiên bản.',
  ACCESSORY_STORAGE_FORBIDDEN: 'Phụ kiện không sử dụng dung lượng bộ nhớ.',
  COMPARE_AT_PRICE_TOO_LOW: 'Giá niêm yết phải lớn hơn hoặc bằng giá bán.',
};
