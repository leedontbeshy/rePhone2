import { type components, type createApiClient } from '@rephone/api-client';
import { apiError } from './order-access';

export type AfterSalesBackofficeApiClient = ReturnType<typeof createApiClient>;
export type AfterSalesType = components['schemas']['BackofficeAfterSalesListItemDto']['type'];
export type AfterSalesStatus = components['schemas']['BackofficeAfterSalesListItemDto']['status'];
export type AfterSalesAction =
  components['schemas']['BackofficeAfterSalesDetailDto']['availableActions'][number];
export type AfterSalesListItem = components['schemas']['BackofficeAfterSalesListItemDto'];
export type AfterSalesDetail = components['schemas']['BackofficeAfterSalesDetailDto'];
export type InspectionDetail = components['schemas']['InspectionDetailDto'];
export type UpdateInspectionInput = components['schemas']['UpdateInspectionDto'];
export type AfterSalesLocationOption = components['schemas']['InventoryLocationDto'];

export interface AfterSalesListQuery {
  q?: string;
  type?: AfterSalesType | '';
  status?: AfterSalesStatus | '';
  assignedToId?: string;
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'updatedAt' | 'requestedAt';
  sortOrder: 'asc' | 'desc';
}

export interface AfterSalesPage {
  data: AfterSalesListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export async function listBackofficeAfterSales(
  client: AfterSalesBackofficeApiClient,
  query: AfterSalesListQuery,
): Promise<AfterSalesPage> {
  const result = await client.GET('/api/v1/backoffice/after-sales', {
    params: { query: compactQuery(query) },
  });
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, 'Không thể tải hàng chờ hậu mãi.'));
  }
  const rows = result.data.data.map(projectListItem);
  const rawMeta: unknown = result.data.meta;
  const meta =
    isRecord(rawMeta) && isRecord(rawMeta['pagination']) ? rawMeta['pagination'] : rawMeta;
  const pagination = isRecord(meta) ? meta : {};
  return {
    data: rows,
    pagination: {
      page: numberOr(pagination['page'], query.page),
      pageSize: numberOr(pagination['pageSize'], query.pageSize),
      totalItems: numberOr(pagination['totalItems'], rows.length),
      totalPages: numberOr(pagination['totalPages'], rows.length === 0 ? 0 : 1),
    },
  };
}

export async function getBackofficeAfterSales(
  client: AfterSalesBackofficeApiClient,
  id: string,
): Promise<AfterSalesDetail> {
  const result = await client.GET('/api/v1/backoffice/after-sales/{id}', {
    params: { path: { id } },
  });
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, 'Không thể tải hồ sơ hậu mãi.'));
  }
  return projectDetail(result.data.data);
}

export async function listAfterSalesLocations(
  client: AfterSalesBackofficeApiClient,
): Promise<AfterSalesLocationOption[]> {
  const result = await client.GET('/api/v1/backoffice/inventory-locations');
  if (result.data === undefined) {
    throw new Error(
      afterSalesBackofficeError(result.error, 'Không thể tải địa điểm tiếp nhận hậu mãi.'),
    );
  }
  return result.data.data.map(({ id, code, name, type, status }) => ({
    id,
    code,
    name,
    type,
    status,
  }));
}

export async function getBackofficeAfterSalesAttachmentUrl(
  client: AfterSalesBackofficeApiClient,
  id: string,
  attachmentId: string,
): Promise<{ url: string; expiresAt: string }> {
  const result = await client.GET(
    '/api/v1/backoffice/after-sales/{id}/attachments/{attachmentId}/url',
    { params: { path: { id, attachmentId } } },
  );
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, 'Không thể mở tệp đính kèm.'));
  }
  const { url, expiresAt } = result.data.data;
  if (!isSafeHttpUrl(url)) throw new Error('Phản hồi signed URL không hợp lệ.');
  return { url, expiresAt };
}

export function assignAfterSales(
  client: AfterSalesBackofficeApiClient,
  id: string,
  employeeId: string | null,
) {
  return command(client, id, 'assign', { employeeId }, 'Không thể phân công hồ sơ.');
}

export function receiveAfterSales(
  client: AfterSalesBackofficeApiClient,
  id: string,
  input: { receivedLocationId: string; note?: string },
) {
  return command(client, id, 'receive', input, 'Không thể xác nhận tiếp nhận sản phẩm.');
}

export function startAfterSalesInspection(client: AfterSalesBackofficeApiClient, id: string) {
  return command(client, id, 'start-inspection', undefined, 'Không thể bắt đầu kiểm định.');
}

export function recordAfterSalesInspectionSummary(
  client: AfterSalesBackofficeApiClient,
  id: string,
  inspectionSummary: string,
) {
  return command(
    client,
    id,
    'record-inspection-summary',
    { inspectionSummary },
    'Không thể lưu kết luận kiểm định phụ kiện.',
  );
}

export function approveAfterSales(client: AfterSalesBackofficeApiClient, id: string, note: string) {
  return command(client, id, 'approve', { note }, 'Không thể duyệt hồ sơ hậu mãi.');
}

export function rejectAfterSales(
  client: AfterSalesBackofficeApiClient,
  id: string,
  input: { reason: string; returnNote?: string },
) {
  return command(client, id, 'reject', input, 'Không thể từ chối hồ sơ hậu mãi.');
}

export function resolveAfterSalesRepaired(
  client: AfterSalesBackofficeApiClient,
  id: string,
  resolutionNote: string,
) {
  return resolve(client, id, 'resolve-repaired', { resolutionNote });
}

export function resolveAfterSalesReplaced(
  client: AfterSalesBackofficeApiClient,
  id: string,
  input: { replacementInventoryUnitId: string; resolutionNote: string },
) {
  return resolve(client, id, 'resolve-replaced', input);
}

export function resolveAfterSalesRefunded(
  client: AfterSalesBackofficeApiClient,
  id: string,
  input: { refundId: string; resolutionNote: string },
) {
  return resolve(client, id, 'resolve-refunded', input);
}

export function resolveAfterSalesReturnedUnchanged(
  client: AfterSalesBackofficeApiClient,
  id: string,
  resolutionNote: string,
) {
  return resolve(client, id, 'resolve-returned-unchanged', { resolutionNote });
}

export function resolveAfterSalesOther(
  client: AfterSalesBackofficeApiClient,
  id: string,
  resolutionNote: string,
) {
  return resolve(client, id, 'resolve-other', { resolutionNote });
}

export async function getAfterSalesInspection(
  client: AfterSalesBackofficeApiClient,
  inspectionId: string,
): Promise<InspectionDetail> {
  const result = await client.GET('/api/v1/backoffice/inspections/{id}', {
    params: { path: { id: inspectionId } },
  });
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, 'Không thể tải checklist kiểm định.'));
  }
  return projectInspection(result.data.data);
}

export async function updateAfterSalesInspection(
  client: AfterSalesBackofficeApiClient,
  inspectionId: string,
  input: UpdateInspectionInput,
): Promise<InspectionDetail> {
  const result = await client.PATCH('/api/v1/backoffice/inspections/{id}', {
    params: { path: { id: inspectionId } },
    body: input,
  });
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, 'Không thể lưu checklist kiểm định.'));
  }
  return projectInspection(result.data.data);
}

export async function completeAfterSalesInspection(
  client: AfterSalesBackofficeApiClient,
  inspectionId: string,
): Promise<InspectionDetail> {
  const result = await client.POST('/api/v1/backoffice/inspections/{id}/complete', {
    params: { path: { id: inspectionId } },
  });
  if (result.data === undefined) {
    throw new Error(
      afterSalesBackofficeError(result.error, 'Không thể hoàn tất checklist kiểm định.'),
    );
  }
  return projectInspection(result.data.data);
}

export function afterSalesBackofficeError(value: unknown, fallback: string): string {
  const code = errorCode(value);
  if (code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy hồ sơ hoặc tài nguyên liên quan.';
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Hồ sơ không còn ở trạng thái cho phép. Hãy tải lại dữ liệu mới nhất.';
  }
  if (code === 'CONCURRENT_MODIFICATION') {
    return 'Hồ sơ vừa được xử lý ở phiên khác. Hãy tải lại.';
  }
  if (code === 'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET') {
    return 'Hồ sơ chưa đủ điều kiện cho thao tác này. Hãy hoàn tất kiểm định hoặc chứng từ liên quan.';
  }
  if (code === 'INVENTORY_NOT_AVAILABLE') {
    return 'Unit thay thế không còn khả dụng hoặc không đúng sản phẩm.';
  }
  if (code === 'INVENTORY_INSPECTION_REQUIRED') {
    return 'Cần hoàn tất kiểm định iPhone trước khi quyết định.';
  }
  if (code === 'STORAGE_UNAVAILABLE') return 'Kho tệp riêng tư tạm thời không sẵn sàng.';
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  if (code === 'FORBIDDEN') return 'Bạn không có quyền thực hiện thao tác này.';
  return apiError(value, fallback);
}

type JsonCommand =
  | 'assign'
  | 'receive'
  | 'start-inspection'
  | 'record-inspection-summary'
  | 'approve'
  | 'reject'
  | 'resolve-repaired'
  | 'resolve-replaced'
  | 'resolve-refunded'
  | 'resolve-returned-unchanged'
  | 'resolve-other';

async function command(
  client: AfterSalesBackofficeApiClient,
  id: string,
  operation: JsonCommand,
  body: unknown,
  fallback: string,
): Promise<AfterSalesDetail> {
  const runtime = client as unknown as {
    POST(
      path: string,
      options: { params: { path: { id: string } }; body?: unknown },
    ): Promise<{ data?: { data: AfterSalesDetail }; error?: unknown }>;
  };
  const options = {
    params: { path: { id } },
    ...(body === undefined ? {} : { body }),
  };
  const result = await runtime.POST(`/api/v1/backoffice/after-sales/{id}/${operation}`, options);
  if (result.data === undefined) {
    throw new Error(afterSalesBackofficeError(result.error, fallback));
  }
  return projectDetail(result.data.data);
}

function resolve(
  client: AfterSalesBackofficeApiClient,
  id: string,
  operation:
    | 'resolve-repaired'
    | 'resolve-replaced'
    | 'resolve-refunded'
    | 'resolve-returned-unchanged'
    | 'resolve-other',
  body: unknown,
) {
  return command(client, id, operation, body, 'Không thể chốt phương án xử lý hậu mãi.');
}

function projectListItem(input: AfterSalesListItem): AfterSalesListItem {
  return {
    id: input.id,
    requestNumber: input.requestNumber,
    type: input.type,
    status: input.status,
    orderItem: { ...input.orderItem },
    issueDescription: input.issueDescription,
    requestedAt: input.requestedAt,
    updatedAt: input.updatedAt,
    customer: { ...input.customer },
    assignedTo:
      input.assignedTo === null || input.assignedTo === undefined ? null : { ...input.assignedTo },
    attachmentCount: input.attachmentCount,
  };
}

function projectDetail(input: AfterSalesDetail): AfterSalesDetail {
  const list = projectListItem(input);
  return {
    ...list,
    requestedResolution: input.requestedResolution ?? null,
    warranty:
      input.warranty === null || input.warranty === undefined ? null : { ...input.warranty },
    receivedLocation:
      input.receivedLocation === null || input.receivedLocation === undefined
        ? null
        : { ...input.receivedLocation },
    receivedBy:
      input.receivedBy === null || input.receivedBy === undefined ? null : { ...input.receivedBy },
    receiveNote: input.receiveNote ?? null,
    inspectionSummary: input.inspectionSummary ?? null,
    inspection:
      input.inspection === null || input.inspection === undefined ? null : { ...input.inspection },
    decidedBy:
      input.decidedBy === null || input.decidedBy === undefined ? null : { ...input.decidedBy },
    resolvedBy:
      input.resolvedBy === null || input.resolvedBy === undefined ? null : { ...input.resolvedBy },
    returnNote: input.returnNote ?? null,
    refund: input.refund === null || input.refund === undefined ? null : { ...input.refund },
    replacementUnit:
      input.replacementUnit === null || input.replacementUnit === undefined
        ? null
        : { ...input.replacementUnit },
    attachments: input.attachments.map(({ id, mimeType, fileSize, uploadedAt }) => ({
      id,
      mimeType,
      fileSize,
      uploadedAt,
    })),
    decisionNote: input.decisionNote ?? null,
    resolutionType: input.resolutionType ?? null,
    resolutionNote: input.resolutionNote ?? null,
    cancelReason: input.cancelReason ?? null,
    timeline: { ...input.timeline },
    availableActions: [...input.availableActions],
  };
}

function projectInspection(input: InspectionDetail): InspectionDetail {
  return {
    id: input.id,
    inventoryUnitId: input.inventoryUnitId,
    inspectionType: input.inspectionType,
    inspectorId: input.inspectorId,
    status: input.status,
    overallResult: input.overallResult,
    isCurrent: input.isCurrent,
    batteryHealthPercent: input.batteryHealthPercent ?? null,
    batteryCycleCount: input.batteryCycleCount ?? null,
    batteryReplacementStatus: input.batteryReplacementStatus,
    conditionGrade: input.conditionGrade ?? null,
    cosmeticNotes: input.cosmeticNotes ?? null,
    checks: input.checks,
    repairHistoryStatus: input.repairHistoryStatus,
    repairNotes: input.repairNotes ?? null,
    replacedParts: input.replacedParts ?? null,
    inspectedAt: input.inspectedAt ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function compactQuery(query: AfterSalesListQuery) {
  return {
    ...(query.q === undefined || query.q.trim() === '' ? {} : { q: query.q.trim() }),
    ...(query.type === undefined || query.type === '' ? {} : { type: query.type }),
    ...(query.status === undefined || query.status === '' ? {} : { status: query.status }),
    ...(query.assignedToId === undefined || query.assignedToId.trim() === ''
      ? {}
      : { assignedToId: query.assignedToId.trim() }),
    ...(query.createdFrom === undefined ? {} : { createdFrom: query.createdFrom }),
    ...(query.createdTo === undefined ? {} : { createdTo: query.createdTo }),
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username !== '' || url.password !== '') return false;
    if (url.protocol === 'https:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
