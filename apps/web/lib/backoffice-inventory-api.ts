import { type components, type createApiClient, type paths } from '@rephone/api-client';

export type InventoryApiClient = ReturnType<typeof createApiClient>;

type ApiInventoryUnitListQuery = NonNullable<
  paths['/api/v1/backoffice/inventory-units']['get']['parameters']['query']
>;
type ApiIntakeInventoryUnit =
  paths['/api/v1/backoffice/inventory-units']['post']['requestBody']['content']['application/json'];
type ApiUpdateInventoryUnit =
  paths['/api/v1/backoffice/inventory-units/{id}']['patch']['requestBody']['content']['application/json'];
type ApiLookupIdentifier =
  paths['/api/v1/backoffice/inventory-units/lookup-identifier']['post']['requestBody']['content']['application/json'];
type ApiInventoryReason =
  paths['/api/v1/backoffice/inventory-units/{id}/quarantine']['post']['requestBody']['content']['application/json'];
type ApiTransferInventoryUnit =
  paths['/api/v1/backoffice/inventory-units/{id}/transfer']['post']['requestBody']['content']['application/json'];
type ApiUpdateInventoryCost =
  paths['/api/v1/backoffice/inventory-units/{id}/cost']['patch']['requestBody']['content']['application/json'];
type ApiInspectionListQuery = NonNullable<
  paths['/api/v1/backoffice/inventory-units/{id}/inspections']['get']['parameters']['query']
>;
type ApiCreateInspection =
  paths['/api/v1/backoffice/inventory-units/{id}/inspections']['post']['requestBody']['content']['application/json'];
type ApiUpdateInspection =
  paths['/api/v1/backoffice/inspections/{id}']['patch']['requestBody']['content']['application/json'];
type ApiUploadUnitMedia =
  paths['/api/v1/backoffice/inventory-units/{id}/media']['post']['requestBody']['content']['multipart/form-data'];
type ApiStockLevelListQuery = NonNullable<
  paths['/api/v1/backoffice/stock-levels']['get']['parameters']['query']
>;
type ApiStockMovementListQuery = NonNullable<
  paths['/api/v1/backoffice/stock-movements']['get']['parameters']['query']
>;
type ApiReceiveStock =
  paths['/api/v1/backoffice/stock/receive']['post']['requestBody']['content']['application/json'];
type ApiTransferStock =
  paths['/api/v1/backoffice/stock/transfer']['post']['requestBody']['content']['application/json'];
type ApiAdjustStock =
  paths['/api/v1/backoffice/stock/adjust']['post']['requestBody']['content']['application/json'];
type ApiReturnStock =
  paths['/api/v1/backoffice/stock/return']['post']['requestBody']['content']['application/json'];

type ApiInventoryUnitListItem = components['schemas']['InventoryUnitListItemDto'];
type ApiInventoryUnitDetail = components['schemas']['InventoryUnitDetailDto'];
type ApiInventoryLocation = components['schemas']['InventoryLocationDto'];
type ApiInventoryCost = components['schemas']['InventoryCostDto'];
type ApiInspectionSummary = components['schemas']['InspectionSummaryDto'];
type ApiInspectionDetail = components['schemas']['InspectionDetailDto'];
type ApiStockLevel = components['schemas']['StockLevelDto'];
type ApiStockMovement = components['schemas']['StockMovementDto'];
type ApiStockCommandResult = components['schemas']['StockCommandResultDto'];
type ApiMedia = components['schemas']['ProductMediaDto'];

export type InventoryLifecycleStatus = ApiInventoryUnitListItem['lifecycleStatus'];
export type InventorySimLockStatus = ApiInventoryUnitListItem['simLockStatus'];
export type InventorySimConfiguration = ApiInventoryUnitDetail['simConfiguration'];
export type InventoryConditionGrade = NonNullable<
  NonNullable<ApiInventoryUnitListItem['currentInspection']>['conditionGrade']
>;
export type InventoryInspectionType = ApiInspectionSummary['inspectionType'];
export type InventoryInspectionStatus = ApiInspectionSummary['status'];
export type InventoryInspectionResult = ApiInspectionSummary['overallResult'];
export type InventoryStockMovementType = ApiStockMovement['type'];
export type InventoryCheckStatus =
  'PASS' | 'FAIL' | 'DEGRADED' | 'NOT_TESTED' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type InventoryUnitAction =
  | 'CREATE_INSPECTION'
  | 'MAKE_AVAILABLE'
  | 'SEND_TO_REPAIR'
  | 'QUARANTINE'
  | 'WRITE_OFF'
  | 'TRANSFER'
  | 'UPLOAD_MEDIA';

export type InventoryAvailabilityReadinessReason =
  | 'STATUS_NOT_INSPECTING'
  | 'INSPECTION_REQUIRED'
  | 'INSPECTION_NOT_PASSED'
  | 'ACTIVE_RESERVATION'
  | 'SALE_PRICE_REQUIRED'
  | 'LOCATION_INACTIVE'
  | 'VARIANT_INACTIVE'
  | 'PRODUCT_INACTIVE'
  | 'IDENTIFIER_REQUIRED'
  | 'MEDIA_REQUIRED';

export interface InventoryPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InventoryProductSummary {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface InventoryVariantSummary {
  id: string;
  sku: string;
  displayName: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  type: 'STORE' | 'WAREHOUSE';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InventoryMaskedIdentifier {
  type: 'IMEI_1' | 'IMEI_2' | 'SERIAL' | 'EID';
  maskedValue: string;
}

export interface InventoryInspectionCurrentSummary {
  id: string;
  overallResult: InventoryInspectionResult;
  conditionGrade: InventoryConditionGrade | null;
  batteryHealthPercent: number | null;
  inspectedAt: string | null;
}

export interface InventoryUnitListItem {
  id: string;
  inventoryCode: string;
  lifecycleStatus: InventoryLifecycleStatus;
  product: InventoryProductSummary;
  variant: InventoryVariantSummary;
  location: InventoryLocation;
  salePrice: string | null;
  compareAtPrice: string | null;
  simLockStatus: InventorySimLockStatus;
  maskedIdentifiers: InventoryMaskedIdentifier[];
  currentInspection: InventoryInspectionCurrentSummary | null;
  activeReservationCount: number;
  mediaCount: number;
  receivedAt: string;
  updatedAt: string;
}

export interface InventoryUnitMedia {
  id: string;
  url: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  altText: string | null;
  createdAt: string;
}

export interface InventoryAvailabilityReadiness {
  isReady: boolean;
  reasons: InventoryAvailabilityReadinessReason[];
}

export interface InventoryUnitDetail extends InventoryUnitListItem {
  carrierName: string | null;
  modelNumber: string | null;
  regionCode: string | null;
  simConfiguration: InventorySimConfiguration;
  warrantyDaysOverride: number | null;
  media: InventoryUnitMedia[];
  availableActions: InventoryUnitAction[];
  availabilityReadiness: InventoryAvailabilityReadiness | null;
}

export interface InventoryUnitPage {
  data: InventoryUnitListItem[];
  pagination: InventoryPagination;
}

export interface InventoryUnitListQuery {
  q?: string;
  productId?: string;
  variantId?: string;
  locationId?: string;
  lifecycleStatus?: InventoryLifecycleStatus | '';
  conditionGrade?: InventoryConditionGrade | '';
  simLockStatus?: InventorySimLockStatus | '';
  minBatteryHealth?: number;
  page: number;
  pageSize: number;
  sortBy: NonNullable<ApiInventoryUnitListQuery['sortBy']>;
  sortOrder: NonNullable<ApiInventoryUnitListQuery['sortOrder']>;
}

export type IntakeInventoryUnitInput = ApiIntakeInventoryUnit;
export type UpdateInventoryUnitInput = ApiUpdateInventoryUnit;
export type LookupInventoryIdentifierInput = ApiLookupIdentifier;
export type TransferInventoryUnitInput = ApiTransferInventoryUnit;

/** Raw identifiers are deliberately separate from every reusable unit projection. */
export interface EphemeralInventoryIdentifiers {
  imei1: string | null;
  imei2: string | null;
  serial: string | null;
  eid: string | null;
}

/** Cost is an explicit admin-only subresource and is never merged into a unit projection. */
export interface AdminInventoryCost {
  acquisitionCost: string | null;
  additionalCost: string;
  totalCost: string | null;
}

export type UpdateAdminInventoryCostInput = ApiUpdateInventoryCost;

export interface InventoryActorSummary {
  id: string;
  fullName: string;
  employeeCode: string | null;
}

export interface InventoryInspectionChecklistItem {
  key: string;
  label: string;
  order: number;
  status: InventoryCheckStatus | null;
  note: string | null;
}

export interface InventoryInspectionChecklist {
  schemaVersion: number;
  items: InventoryInspectionChecklistItem[];
}

export interface InventoryInspectionChecksInput {
  schemaVersion: 1;
  items: Record<
    string,
    {
      status: InventoryCheckStatus;
      note?: string | null;
    }
  >;
}

export interface InventoryInspectionSummary {
  id: string;
  inspectionType: InventoryInspectionType;
  status: InventoryInspectionStatus;
  overallResult: InventoryInspectionResult;
  inspectorId: string;
  inspector: InventoryActorSummary | null;
  isCurrent: boolean;
  inspectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryInspectionDetail extends InventoryInspectionSummary {
  inventoryUnitId: string;
  checks: InventoryInspectionChecksInput | null;
  checklist: InventoryInspectionChecklist | null;
  batteryHealthPercent: number | null;
  batteryCycleCount: number | null;
  batteryReplacementStatus: 'ORIGINAL' | 'REPLACED' | 'UNKNOWN';
  conditionGrade: InventoryConditionGrade | null;
  cosmeticNotes: string | null;
  repairHistoryStatus: 'NONE_KNOWN' | 'KNOWN' | 'UNKNOWN';
  repairNotes: string | null;
  replacedParts: Record<string, unknown> | null;
}

export interface InventoryInspectionPage {
  data: InventoryInspectionSummary[];
  pagination: InventoryPagination;
}

export interface InventoryInspectionListQuery {
  page: number;
  pageSize: number;
}

export type CreateInventoryInspectionInput = ApiCreateInspection;
export type UpdateInventoryInspectionInput = Omit<ApiUpdateInspection, 'checks'> & {
  checks?: InventoryInspectionChecksInput;
};

export interface InventoryStockLevel {
  id: string;
  product: InventoryProductSummary | null;
  variant: InventoryVariantSummary;
  location: InventoryLocation;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderThreshold: number;
  lowStock: boolean;
  updatedAt: string;
}

export interface InventoryStockLevelPage {
  data: InventoryStockLevel[];
  pagination: InventoryPagination;
}

export interface InventoryStockLevelListQuery {
  variantId?: string;
  locationId?: string;
  lowStock?: boolean;
  page: number;
  pageSize: number;
}

export interface InventoryStockMovement {
  id: string;
  type: InventoryStockMovementType;
  variantId: string;
  product: InventoryProductSummary | null;
  variant: InventoryVariantSummary | null;
  fromLocationId: string | null;
  fromLocation: InventoryLocation | null;
  toLocationId: string | null;
  toLocation: InventoryLocation | null;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdById: string | null;
  createdBy: InventoryActorSummary | null;
  createdAt: string;
}

export interface InventoryStockMovementPage {
  data: InventoryStockMovement[];
  pagination: InventoryPagination;
}

export interface InventoryStockMovementListQuery {
  variantId?: string;
  locationId?: string;
  type?: InventoryStockMovementType | '';
  dateFrom?: string;
  dateTo?: string;
  referenceType?: string;
  referenceId?: string;
  page: number;
  pageSize: number;
}

export interface InventoryStockCommandResult {
  affectedLevels: InventoryStockLevel[];
  movement: InventoryStockMovement;
}

export type ReceiveInventoryStockInput = ApiReceiveStock;
export type TransferInventoryStockInput = ApiTransferStock;
export type AdjustInventoryStockInput = ApiAdjustStock;
export type ReturnInventoryStockInput = ApiReturnStock;

export interface InventoryMediaUploadInput {
  file: Blob;
  altText?: string;
  sortOrder?: number;
}

export interface InventoryRequestOptions {
  signal?: AbortSignal;
}

export class InventoryAdminError extends Error {
  public constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'InventoryAdminError';
  }

  public get requiresRefetch(): boolean {
    return REFETCH_ERROR_CODES.has(this.code ?? '');
  }
}

export const INVENTORY_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const INVENTORY_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export function canRequestInventoryCost(role: string | null | undefined): role is 'ADMIN' {
  return role === 'ADMIN';
}

export function validateInventoryMediaFile(file: Blob): string | null {
  if (file.size === 0) return 'Tệp ảnh đang trống.';
  if (file.size > INVENTORY_MEDIA_MAX_BYTES) return 'Ảnh vượt quá giới hạn 8 MB.';
  if (!(INVENTORY_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.';
  }
  return null;
}

export async function listInventoryUnits(
  client: InventoryApiClient,
  query: InventoryUnitListQuery,
  options: InventoryRequestOptions = {},
): Promise<InventoryUnitPage> {
  const apiQuery: ApiInventoryUnitListQuery = {
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...optionalTrimmed('q', query.q),
    ...optionalTrimmed('productId', query.productId),
    ...optionalTrimmed('variantId', query.variantId),
    ...optionalTrimmed('locationId', query.locationId),
    ...(query.lifecycleStatus === undefined || query.lifecycleStatus === ''
      ? {}
      : { lifecycleStatus: query.lifecycleStatus }),
    ...(query.conditionGrade === undefined || query.conditionGrade === ''
      ? {}
      : { conditionGrade: query.conditionGrade }),
    ...(query.simLockStatus === undefined || query.simLockStatus === ''
      ? {}
      : { simLockStatus: query.simLockStatus }),
    ...(query.minBatteryHealth === undefined ? {} : { minBatteryHealth: query.minBatteryHealth }),
  };
  const result = await client.GET('/api/v1/backoffice/inventory-units', {
    params: { query: apiQuery },
    ...signalOptions(options),
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải danh sách máy.');
  }
  return {
    data: result.data.data.map(toInventoryUnitListItem),
    pagination: toPagination(result.data.meta.pagination),
  };
}

export async function lookupInventoryUnitIdentifier(
  client: InventoryApiClient,
  input: LookupInventoryIdentifierInput,
): Promise<InventoryUnitListItem> {
  const body: ApiLookupIdentifier = {
    type: input.type,
    value: input.value.trim(),
  };
  const result = await client.POST('/api/v1/backoffice/inventory-units/lookup-identifier', {
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tra cứu mã thiết bị.');
  }
  return toInventoryUnitListItem(result.data.data);
}

export async function intakeInventoryUnit(
  client: InventoryApiClient,
  input: IntakeInventoryUnitInput,
): Promise<InventoryUnitDetail> {
  const body: ApiIntakeInventoryUnit = input;
  const result = await client.POST('/api/v1/backoffice/inventory-units', { body });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể nhập máy vào kho.');
  }
  return toInventoryUnitDetail(result.data.data);
}

export async function getInventoryUnit(
  client: InventoryApiClient,
  unitId: string,
): Promise<InventoryUnitDetail> {
  const result = await client.GET('/api/v1/backoffice/inventory-units/{id}', {
    params: { path: { id: unitId } },
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể mở hồ sơ máy.');
  }
  return toInventoryUnitDetail(result.data.data);
}

export async function updateInventoryUnit(
  client: InventoryApiClient,
  unitId: string,
  input: UpdateInventoryUnitInput,
): Promise<InventoryUnitDetail> {
  const body: ApiUpdateInventoryUnit = {
    ...input,
    ...(input.reason === undefined ? {} : { reason: input.reason.trim() }),
  };
  const result = await client.PATCH('/api/v1/backoffice/inventory-units/{id}', {
    params: { path: { id: unitId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể cập nhật hồ sơ máy.');
  }
  return toInventoryUnitDetail(result.data.data);
}

export async function revealInventoryUnitIdentifiers(
  client: InventoryApiClient,
  unitId: string,
  reason: string,
): Promise<EphemeralInventoryIdentifiers> {
  const body: ApiInventoryReason = { reason: reason.trim() };
  const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/reveal-identifiers', {
    params: { path: { id: unitId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể xem mã thiết bị.');
  }
  return {
    imei1: result.data.data.imei1 ?? null,
    imei2: result.data.data.imei2 ?? null,
    serial: result.data.data.serial ?? null,
    eid: result.data.data.eid ?? null,
  };
}

export function makeInventoryUnitAvailable(
  client: InventoryApiClient,
  unitId: string,
): Promise<InventoryUnitDetail> {
  return runUnitCommand(
    client,
    '/api/v1/backoffice/inventory-units/{id}/make-available',
    unitId,
    undefined,
    'Không thể đưa máy lên bán.',
  );
}

export function sendInventoryUnitToRepair(
  client: InventoryApiClient,
  unitId: string,
  reason: string,
): Promise<InventoryUnitDetail> {
  return runUnitReasonCommand(
    client,
    '/api/v1/backoffice/inventory-units/{id}/send-to-repair',
    unitId,
    reason,
    'Không thể chuyển máy sang sửa chữa.',
  );
}

export function quarantineInventoryUnit(
  client: InventoryApiClient,
  unitId: string,
  reason: string,
): Promise<InventoryUnitDetail> {
  return runUnitReasonCommand(
    client,
    '/api/v1/backoffice/inventory-units/{id}/quarantine',
    unitId,
    reason,
    'Không thể cách ly máy.',
  );
}

export function writeOffInventoryUnit(
  client: InventoryApiClient,
  unitId: string,
  reason: string,
): Promise<InventoryUnitDetail> {
  return runUnitReasonCommand(
    client,
    '/api/v1/backoffice/inventory-units/{id}/write-off',
    unitId,
    reason,
    'Không thể ghi nhận thanh lý máy.',
  );
}

export async function transferInventoryUnit(
  client: InventoryApiClient,
  unitId: string,
  input: TransferInventoryUnitInput,
): Promise<InventoryUnitDetail> {
  const body: ApiTransferInventoryUnit = {
    toLocationId: input.toLocationId,
    ...(input.reason === undefined || input.reason.trim() === ''
      ? {}
      : { reason: input.reason.trim() }),
  };
  const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/transfer', {
    params: { path: { id: unitId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể chuyển địa điểm máy.');
  }
  return toInventoryUnitDetail(result.data.data);
}

/** Call only from an ADMIN-gated compartment; ordinary unit loaders never request cost. */
export async function getAdminInventoryUnitCost(
  client: InventoryApiClient,
  unitId: string,
): Promise<AdminInventoryCost> {
  const result = await client.GET('/api/v1/backoffice/inventory-units/{id}/cost', {
    params: { path: { id: unitId } },
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải giá vốn.');
  }
  return toInventoryCost(result.data.data);
}

/** Call only from an ADMIN-gated compartment; the result is not cached by this adapter. */
export async function updateAdminInventoryUnitCost(
  client: InventoryApiClient,
  unitId: string,
  input: UpdateAdminInventoryCostInput,
): Promise<AdminInventoryCost> {
  const body: ApiUpdateInventoryCost = { ...input, reason: input.reason.trim() };
  const result = await client.PATCH('/api/v1/backoffice/inventory-units/{id}/cost', {
    params: { path: { id: unitId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể cập nhật giá vốn.');
  }
  return toInventoryCost(result.data.data);
}

export async function listInventoryUnitInspections(
  client: InventoryApiClient,
  unitId: string,
  query: InventoryInspectionListQuery,
  options: InventoryRequestOptions = {},
): Promise<InventoryInspectionPage> {
  const apiQuery: ApiInspectionListQuery = { page: query.page, pageSize: query.pageSize };
  const result = await client.GET('/api/v1/backoffice/inventory-units/{id}/inspections', {
    params: { path: { id: unitId }, query: apiQuery },
    ...signalOptions(options),
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải lịch sử kiểm định.');
  }
  return {
    data: result.data.data.map(toInspectionSummary),
    pagination: toPagination(result.data.meta.pagination),
  };
}

export async function createInventoryUnitInspection(
  client: InventoryApiClient,
  unitId: string,
  input: CreateInventoryInspectionInput,
): Promise<InventoryInspectionDetail> {
  const body: ApiCreateInspection = input;
  const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/inspections', {
    params: { path: { id: unitId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể bắt đầu kiểm định.');
  }
  return toInspectionDetail(result.data.data);
}

export async function getInventoryInspection(
  client: InventoryApiClient,
  inspectionId: string,
): Promise<InventoryInspectionDetail> {
  const result = await client.GET('/api/v1/backoffice/inspections/{id}', {
    params: { path: { id: inspectionId } },
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể mở phiếu kiểm định.');
  }
  return toInspectionDetail(result.data.data);
}

export async function updateInventoryInspection(
  client: InventoryApiClient,
  inspectionId: string,
  input: UpdateInventoryInspectionInput,
): Promise<InventoryInspectionDetail> {
  // The generated OpenAPI type currently collapses the versioned JSON object to
  // Record<string, never>; keep the public input precise until the schema generator is corrected.
  const body = input as unknown as ApiUpdateInspection;
  const result = await client.PATCH('/api/v1/backoffice/inspections/{id}', {
    params: { path: { id: inspectionId } },
    body,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể lưu bản nháp kiểm định.');
  }
  return toInspectionDetail(result.data.data);
}

export async function completeInventoryInspection(
  client: InventoryApiClient,
  inspectionId: string,
): Promise<InventoryInspectionDetail> {
  const result = await client.POST('/api/v1/backoffice/inspections/{id}/complete', {
    params: { path: { id: inspectionId } },
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể hoàn tất kiểm định.');
  }
  return toInspectionDetail(result.data.data);
}

export async function listInventoryLocations(
  client: InventoryApiClient,
  options: InventoryRequestOptions = {},
): Promise<InventoryLocation[]> {
  const result = await client.GET('/api/v1/backoffice/inventory-locations', {
    ...signalOptions(options),
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải danh sách địa điểm.');
  }
  return result.data.data.map(toLocation);
}

export async function uploadInventoryUnitMedia(
  client: InventoryApiClient,
  unitId: string,
  input: InventoryMediaUploadInput,
): Promise<InventoryUnitMedia> {
  const validationMessage = validateInventoryMediaFile(input.file);
  if (validationMessage !== null) throw new InventoryAdminError(validationMessage);

  const body: ApiUploadUnitMedia = {
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

  const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/media', {
    params: { path: { id: unitId } },
    body,
    bodySerializer: () => formData,
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải ảnh máy lên.');
  }
  return toUnitMedia(result.data.data);
}

export async function listInventoryStockLevels(
  client: InventoryApiClient,
  query: InventoryStockLevelListQuery,
  options: InventoryRequestOptions = {},
): Promise<InventoryStockLevelPage> {
  const apiQuery: ApiStockLevelListQuery = {
    page: query.page,
    pageSize: query.pageSize,
    ...optionalTrimmed('variantId', query.variantId),
    ...optionalTrimmed('locationId', query.locationId),
    ...(query.lowStock === undefined ? {} : { lowStock: query.lowStock }),
  };
  const result = await client.GET('/api/v1/backoffice/stock-levels', {
    params: { query: apiQuery },
    ...signalOptions(options),
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải tồn phụ kiện.');
  }
  return {
    data: result.data.data.map(toStockLevel),
    pagination: toPagination(result.data.meta.pagination),
  };
}

export async function listInventoryStockMovements(
  client: InventoryApiClient,
  query: InventoryStockMovementListQuery,
  options: InventoryRequestOptions = {},
): Promise<InventoryStockMovementPage> {
  const apiQuery: ApiStockMovementListQuery = {
    page: query.page,
    pageSize: query.pageSize,
    ...optionalTrimmed('variantId', query.variantId),
    ...optionalTrimmed('locationId', query.locationId),
    ...(query.type === undefined || query.type === '' ? {} : { type: query.type }),
    ...optionalTrimmed('dateFrom', query.dateFrom),
    ...optionalTrimmed('dateTo', query.dateTo),
    ...optionalTrimmed('referenceType', query.referenceType),
    ...optionalTrimmed('referenceId', query.referenceId),
  };
  const result = await client.GET('/api/v1/backoffice/stock-movements', {
    params: { query: apiQuery },
    ...signalOptions(options),
  });
  if (result.data === undefined) {
    throw inventoryAdminError(result.error, 'Không thể tải lịch sử kho.');
  }
  return {
    data: result.data.data.map(toStockMovement),
    pagination: toPagination(result.data.meta.pagination),
  };
}

export function receiveInventoryStock(
  client: InventoryApiClient,
  input: ReceiveInventoryStockInput,
): Promise<InventoryStockCommandResult> {
  const body: ApiReceiveStock = {
    ...input,
    ...(input.reason === undefined || input.reason.trim() === ''
      ? {}
      : { reason: input.reason.trim() }),
  };
  return runStockCommand(
    client,
    '/api/v1/backoffice/stock/receive',
    body,
    'Không thể nhận phụ kiện vào kho.',
  );
}

export function transferInventoryStock(
  client: InventoryApiClient,
  input: TransferInventoryStockInput,
): Promise<InventoryStockCommandResult> {
  const body: ApiTransferStock = {
    ...input,
    ...(input.reason === undefined || input.reason.trim() === ''
      ? {}
      : { reason: input.reason.trim() }),
  };
  return runStockCommand(
    client,
    '/api/v1/backoffice/stock/transfer',
    body,
    'Không thể chuyển phụ kiện giữa các địa điểm.',
  );
}

export function adjustInventoryStock(
  client: InventoryApiClient,
  input: AdjustInventoryStockInput,
): Promise<InventoryStockCommandResult> {
  const body: ApiAdjustStock = { ...input, reason: input.reason.trim() };
  return runStockCommand(
    client,
    '/api/v1/backoffice/stock/adjust',
    body,
    'Không thể điều chỉnh tồn phụ kiện.',
  );
}

export function returnInventoryStock(
  client: InventoryApiClient,
  input: ReturnInventoryStockInput,
): Promise<InventoryStockCommandResult> {
  const body: ApiReturnStock = { ...input, reason: input.reason.trim() };
  return runStockCommand(
    client,
    '/api/v1/backoffice/stock/return',
    body,
    'Không thể hoàn phụ kiện về kho.',
  );
}

export function inventoryErrorRequiresRefetch(error: unknown): boolean {
  return error instanceof InventoryAdminError && error.requiresRefetch;
}

export function inventoryAdminError(value: unknown, fallback: string): InventoryAdminError {
  const code = errorCode(value);
  const detailCode = validationDetailCode(value);
  const message =
    (detailCode === undefined ? undefined : ERROR_MESSAGES[detailCode]) ??
    (code === undefined ? undefined : ERROR_MESSAGES[code]) ??
    fallback;
  return new InventoryAdminError(message, code);
}

async function runUnitReasonCommand(
  client: InventoryApiClient,
  path:
    | '/api/v1/backoffice/inventory-units/{id}/send-to-repair'
    | '/api/v1/backoffice/inventory-units/{id}/quarantine'
    | '/api/v1/backoffice/inventory-units/{id}/write-off',
  unitId: string,
  reason: string,
  fallback: string,
): Promise<InventoryUnitDetail> {
  return runUnitCommand(client, path, unitId, { reason: reason.trim() }, fallback);
}

async function runUnitCommand(
  client: InventoryApiClient,
  path:
    | '/api/v1/backoffice/inventory-units/{id}/make-available'
    | '/api/v1/backoffice/inventory-units/{id}/send-to-repair'
    | '/api/v1/backoffice/inventory-units/{id}/quarantine'
    | '/api/v1/backoffice/inventory-units/{id}/write-off',
  unitId: string,
  body: ApiInventoryReason | undefined,
  fallback: string,
): Promise<InventoryUnitDetail> {
  const options = {
    params: { path: { id: unitId } },
    ...(body === undefined ? {} : { body }),
  };
  const result =
    path === '/api/v1/backoffice/inventory-units/{id}/make-available'
      ? await client.POST(path, { params: options.params })
      : path === '/api/v1/backoffice/inventory-units/{id}/send-to-repair'
        ? await client.POST(path, { params: options.params, body: body as ApiInventoryReason })
        : path === '/api/v1/backoffice/inventory-units/{id}/quarantine'
          ? await client.POST(path, { params: options.params, body: body as ApiInventoryReason })
          : await client.POST(path, { params: options.params, body: body as ApiInventoryReason });
  if (result.data === undefined) throw inventoryAdminError(result.error, fallback);
  return toInventoryUnitDetail(result.data.data);
}

async function runStockCommand(
  client: InventoryApiClient,
  path:
    | '/api/v1/backoffice/stock/receive'
    | '/api/v1/backoffice/stock/transfer'
    | '/api/v1/backoffice/stock/adjust'
    | '/api/v1/backoffice/stock/return',
  body: ApiReceiveStock | ApiTransferStock | ApiAdjustStock | ApiReturnStock,
  fallback: string,
): Promise<InventoryStockCommandResult> {
  const result =
    path === '/api/v1/backoffice/stock/receive'
      ? await client.POST(path, { body: body as ApiReceiveStock })
      : path === '/api/v1/backoffice/stock/transfer'
        ? await client.POST(path, { body: body as ApiTransferStock })
        : path === '/api/v1/backoffice/stock/adjust'
          ? await client.POST(path, { body: body as ApiAdjustStock })
          : await client.POST(path, { body: body as ApiReturnStock });
  if (result.data === undefined) throw inventoryAdminError(result.error, fallback);
  return toStockCommandResult(result.data.data);
}

function toInventoryUnitListItem(unit: ApiInventoryUnitListItem): InventoryUnitListItem {
  return {
    id: unit.id,
    inventoryCode: unit.inventoryCode,
    lifecycleStatus: unit.lifecycleStatus,
    product: toProduct(unit.product),
    variant: toVariant(unit.variant),
    location: toLocation(unit.location),
    salePrice: unit.salePrice ?? null,
    compareAtPrice: unit.compareAtPrice ?? null,
    simLockStatus: unit.simLockStatus,
    maskedIdentifiers: unit.maskedIdentifiers.map((identifier) => ({
      type: identifier.type,
      maskedValue: identifier.maskedValue,
    })),
    currentInspection:
      unit.currentInspection === null || unit.currentInspection === undefined
        ? null
        : {
            id: unit.currentInspection.id,
            overallResult: unit.currentInspection.overallResult,
            conditionGrade: unit.currentInspection.conditionGrade ?? null,
            batteryHealthPercent: unit.currentInspection.batteryHealthPercent ?? null,
            inspectedAt: unit.currentInspection.inspectedAt ?? null,
          },
    activeReservationCount: unit.activeReservationCount,
    mediaCount: unit.mediaCount,
    receivedAt: unit.receivedAt,
    updatedAt: unit.updatedAt,
  };
}

function toInventoryUnitDetail(unit: ApiInventoryUnitDetail): InventoryUnitDetail {
  const projection = asRecord(unit);
  return {
    ...toInventoryUnitListItem(unit),
    carrierName: unit.carrierName ?? null,
    modelNumber: unit.modelNumber ?? null,
    regionCode: unit.regionCode ?? null,
    simConfiguration: unit.simConfiguration,
    warrantyDaysOverride: unit.warrantyDaysOverride ?? null,
    media: arrayValue(projection.media).flatMap((media) => {
      const projected = toOptionalUnitMedia(media);
      return projected === null ? [] : [projected];
    }),
    availableActions: arrayValue(projection.availableActions).filter(isInventoryUnitAction),
    availabilityReadiness: toReadiness(projection.availabilityReadiness),
  };
}

function toInventoryCost(cost: ApiInventoryCost): AdminInventoryCost {
  return {
    acquisitionCost: cost.acquisitionCost ?? null,
    additionalCost: cost.additionalCost,
    totalCost: cost.totalCost ?? null,
  };
}

function toInspectionSummary(inspection: ApiInspectionSummary): InventoryInspectionSummary {
  const projection = asRecord(inspection);
  return {
    id: inspection.id,
    inspectionType: inspection.inspectionType,
    status: inspection.status,
    overallResult: inspection.overallResult,
    inspectorId: inspection.inspectorId,
    inspector: toOptionalActor(projection.inspector),
    isCurrent: inspection.isCurrent,
    inspectedAt: inspection.inspectedAt ?? null,
    createdAt: inspection.createdAt,
    updatedAt: inspection.updatedAt,
  };
}

function toInspectionDetail(inspection: ApiInspectionDetail): InventoryInspectionDetail {
  const projection = asRecord(inspection);
  return {
    ...toInspectionSummary(inspection),
    inventoryUnitId: inspection.inventoryUnitId,
    checks: toInspectionChecks(inspection.checks),
    checklist: toInspectionChecklist(projection.checklist),
    batteryHealthPercent: inspection.batteryHealthPercent ?? null,
    batteryCycleCount: inspection.batteryCycleCount ?? null,
    batteryReplacementStatus: inspection.batteryReplacementStatus,
    conditionGrade: inspection.conditionGrade ?? null,
    cosmeticNotes: inspection.cosmeticNotes ?? null,
    repairHistoryStatus: inspection.repairHistoryStatus,
    repairNotes: inspection.repairNotes ?? null,
    replacedParts: isRecord(inspection.replacedParts) ? inspection.replacedParts : null,
  };
}

function toStockLevel(level: ApiStockLevel): InventoryStockLevel {
  const projection = asRecord(level);
  return {
    id: level.id,
    product: toOptionalProduct(projection.product),
    variant: toVariant(level.variant),
    location: toLocation(level.location),
    quantityOnHand: level.quantityOnHand,
    quantityReserved: level.quantityReserved,
    quantityAvailable: level.quantityAvailable,
    reorderThreshold: level.reorderThreshold,
    lowStock: level.lowStock,
    updatedAt: level.updatedAt,
  };
}

function toStockMovement(movement: ApiStockMovement): InventoryStockMovement {
  const projection = asRecord(movement);
  return {
    id: movement.id,
    type: movement.type,
    variantId: movement.variantId,
    product: toOptionalProduct(projection.product),
    variant: toOptionalVariant(projection.variant),
    fromLocationId: movement.fromLocationId ?? null,
    fromLocation: toOptionalLocation(projection.fromLocation),
    toLocationId: movement.toLocationId ?? null,
    toLocation: toOptionalLocation(projection.toLocation),
    quantity: movement.quantity,
    referenceType: movement.referenceType ?? null,
    referenceId: movement.referenceId ?? null,
    reason: movement.reason ?? null,
    createdById: movement.createdById ?? null,
    createdBy: toOptionalActor(projection.createdBy),
    createdAt: movement.createdAt,
  };
}

function toStockCommandResult(result: ApiStockCommandResult): InventoryStockCommandResult {
  return {
    affectedLevels: result.affectedLevels.map(toStockLevel),
    movement: toStockMovement(result.movement),
  };
}

function toProduct(product: ApiInventoryUnitListItem['product']): InventoryProductSummary {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
  };
}

function toVariant(variant: ApiInventoryUnitListItem['variant']): InventoryVariantSummary {
  return {
    id: variant.id,
    sku: variant.sku,
    displayName: variant.displayName,
    status: variant.status,
  };
}

function toLocation(location: ApiInventoryLocation): InventoryLocation {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
    status: location.status,
  };
}

function toUnitMedia(media: ApiMedia): InventoryUnitMedia {
  return {
    id: media.id,
    url: media.url,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    width: media.width,
    height: media.height,
    sortOrder: media.sortOrder,
    altText: media.altText ?? null,
    createdAt: media.createdAt,
  };
}

function toOptionalUnitMedia(value: unknown): InventoryUnitMedia | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const url = stringValue(value.url);
  const mimeType = stringValue(value.mimeType);
  const createdAt = stringValue(value.createdAt);
  const fileSize = numberValue(value.fileSize);
  const sortOrder = numberValue(value.sortOrder);
  if (
    id === null ||
    url === null ||
    mimeType === null ||
    createdAt === null ||
    fileSize === null ||
    sortOrder === null
  ) {
    return null;
  }
  return {
    id,
    url,
    mimeType,
    fileSize,
    width: numberValue(value.width),
    height: numberValue(value.height),
    sortOrder,
    altText: stringValue(value.altText),
    createdAt,
  };
}

function toReadiness(value: unknown): InventoryAvailabilityReadiness | null {
  if (!isRecord(value) || typeof value.isReady !== 'boolean') return null;
  return {
    isReady: value.isReady,
    reasons: arrayValue(value.reasons).filter(isReadinessReason),
  };
}

function toInspectionChecks(value: unknown): InventoryInspectionChecksInput | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.items)) return null;
  const items: InventoryInspectionChecksInput['items'] = {};
  for (const [key, item] of Object.entries(value.items)) {
    if (!isRecord(item) || !isInventoryCheckStatus(item.status)) continue;
    items[key] = {
      status: item.status,
      ...(item.note === null || typeof item.note === 'string' ? { note: item.note } : {}),
    };
  }
  return { schemaVersion: 1, items };
}

function toInspectionChecklist(value: unknown): InventoryInspectionChecklist | null {
  if (!isRecord(value)) return null;
  const schemaVersion = numberValue(value.schemaVersion);
  if (schemaVersion === null) return null;
  const items = arrayValue(value.items).flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = stringValue(item.key);
    const label = stringValue(item.label);
    const order = numberValue(item.order);
    const status = item.status === null || item.status === undefined ? null : item.status;
    if (
      key === null ||
      label === null ||
      order === null ||
      (status !== null && !isInventoryCheckStatus(status))
    ) {
      return [];
    }
    return [
      {
        key,
        label,
        order,
        status,
        note: stringValue(item.note),
      } satisfies InventoryInspectionChecklistItem,
    ];
  });
  return { schemaVersion, items };
}

function toOptionalProduct(value: unknown): InventoryProductSummary | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const slug = stringValue(value.slug);
  const status = value.status;
  if (
    id === null ||
    name === null ||
    slug === null ||
    (status !== 'DRAFT' && status !== 'ACTIVE' && status !== 'ARCHIVED')
  ) {
    return null;
  }
  return { id, name, slug, status };
}

function toOptionalVariant(value: unknown): InventoryVariantSummary | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const sku = stringValue(value.sku);
  const displayName = stringValue(value.displayName);
  const status = value.status;
  if (
    id === null ||
    sku === null ||
    displayName === null ||
    (status !== 'DRAFT' && status !== 'ACTIVE' && status !== 'ARCHIVED')
  ) {
    return null;
  }
  return { id, sku, displayName, status };
}

function toOptionalLocation(value: unknown): InventoryLocation | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const code = stringValue(value.code);
  const name = stringValue(value.name);
  const type = value.type;
  const status = value.status;
  if (
    id === null ||
    code === null ||
    name === null ||
    (type !== 'STORE' && type !== 'WAREHOUSE') ||
    (status !== 'ACTIVE' && status !== 'INACTIVE')
  ) {
    return null;
  }
  return { id, code, name, type, status };
}

function toOptionalActor(value: unknown): InventoryActorSummary | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const fullName = stringValue(value.fullName);
  if (id === null || fullName === null) return null;
  return { id, fullName, employeeCode: stringValue(value.employeeCode) };
}

function toPagination(value: components['schemas']['PaginationDto']): InventoryPagination {
  return {
    page: value.page,
    pageSize: value.pageSize,
    totalItems: value.totalItems,
    totalPages: value.totalPages,
  };
}

function signalOptions(options: InventoryRequestOptions): { signal?: AbortSignal } {
  return options.signal === undefined ? {} : { signal: options.signal };
}

function optionalTrimmed<Key extends string>(
  key: Key,
  value: string | undefined,
): Partial<Record<Key, string>> {
  if (value === undefined || value.trim() === '') return {};
  return { [key]: value.trim() } as Partial<Record<Key, string>>;
}

function errorCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.error) ? value.error : value;
  return typeof nested.code === 'string' ? nested.code : undefined;
}

function validationDetailCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.error) ? value.error : value;
  if (!Array.isArray(nested.details)) return undefined;
  for (const detail of nested.details) {
    if (isRecord(detail) && typeof detail.code === 'string') return detail.code;
  }
  return undefined;
}

function isInventoryUnitAction(value: unknown): value is InventoryUnitAction {
  return INVENTORY_UNIT_ACTIONS.has(String(value));
}

function isReadinessReason(value: unknown): value is InventoryAvailabilityReadinessReason {
  return READINESS_REASONS.has(String(value));
}

function isInventoryCheckStatus(value: unknown): value is InventoryCheckStatus {
  return CHECK_STATUSES.has(String(value));
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const INVENTORY_UNIT_ACTIONS = new Set<string>([
  'CREATE_INSPECTION',
  'MAKE_AVAILABLE',
  'SEND_TO_REPAIR',
  'QUARANTINE',
  'WRITE_OFF',
  'TRANSFER',
  'UPLOAD_MEDIA',
]);

const READINESS_REASONS = new Set<string>([
  'STATUS_NOT_INSPECTING',
  'INSPECTION_REQUIRED',
  'INSPECTION_NOT_PASSED',
  'ACTIVE_RESERVATION',
  'SALE_PRICE_REQUIRED',
  'LOCATION_INACTIVE',
  'VARIANT_INACTIVE',
  'PRODUCT_INACTIVE',
  'IDENTIFIER_REQUIRED',
  'MEDIA_REQUIRED',
]);

const CHECK_STATUSES = new Set<string>([
  'PASS',
  'FAIL',
  'DEGRADED',
  'NOT_TESTED',
  'NOT_APPLICABLE',
  'UNKNOWN',
]);

const REFETCH_ERROR_CODES = new Set<string>([
  'FORBIDDEN',
  'CONCURRENT_MODIFICATION',
  'INVALID_STATE_TRANSITION',
  'RESOURCE_NOT_FOUND',
  'INVENTORY_NOT_AVAILABLE',
  'INVENTORY_INSPECTION_REQUIRED',
  'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
]);

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập.',
  FORBIDDEN: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
  RESOURCE_NOT_FOUND: 'Dữ liệu này không còn tồn tại. Hãy tải lại trang.',
  DUPLICATE_RESOURCE: 'Thông tin này đã tồn tại trong hệ thống.',
  INVALID_STATE_TRANSITION: 'Trạng thái vừa thay đổi. Hãy tải lại dữ liệu trước khi tiếp tục.',
  CONCURRENT_MODIFICATION: 'Dữ liệu vừa được người khác cập nhật. Hãy tải lại trước khi tiếp tục.',
  INVENTORY_NOT_AVAILABLE: 'Tồn kho hiện không còn đáp ứng thao tác này. Hãy tải lại dữ liệu.',
  INVENTORY_INSPECTION_REQUIRED: 'Máy cần hoàn tất kiểm định đạt yêu cầu trước khi đưa lên bán.',
  INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET:
    'Máy chưa đủ điều kiện đưa lên bán. Hãy kiểm tra các mục còn thiếu.',
  FILE_TOO_LARGE: 'Ảnh vượt quá dung lượng cho phép.',
  UNSUPPORTED_FILE_TYPE: 'Định dạng ảnh này chưa được hỗ trợ.',
  STORAGE_UNAVAILABLE: 'Kho ảnh đang tạm gián đoạn. Vui lòng thử lại sau.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.',
  SERVICE_UNAVAILABLE: 'Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau.',
};
