import type { FeedbackTone } from '@/components/ui';

export type InventoryLifecycleStatus =
  | 'RECEIVED'
  | 'INSPECTING'
  | 'AVAILABLE'
  | 'IN_TRANSIT'
  | 'SOLD'
  | 'REPAIRING'
  | 'QUARANTINED'
  | 'WRITTEN_OFF';

export type InventoryInspectionStatus = 'DRAFT' | 'COMPLETED';
export type InventoryInspectionResult = 'INCOMPLETE' | 'PASSED' | 'PARTIAL' | 'FAILED';
export type InventoryInspectionType = 'INTAKE' | 'RETURN' | 'WARRANTY' | 'PRE_SALE';
export type InventoryStockMovementType =
  'RECEIPT' | 'SALE' | 'RETURN' | 'TRANSFER' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'WRITE_OFF';
export type InventoryInspectionCheckStatus =
  'PASS' | 'FAIL' | 'DEGRADED' | 'NOT_TESTED' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface InventoryStatusPresentation {
  readonly label: string;
  readonly tone: FeedbackTone;
}

const LIFECYCLE_PRESENTATION: Record<InventoryLifecycleStatus, InventoryStatusPresentation> = {
  RECEIVED: { label: 'Đã tiếp nhận', tone: 'info' },
  INSPECTING: { label: 'Đang kiểm định', tone: 'info' },
  AVAILABLE: { label: 'Sẵn sàng bán', tone: 'success' },
  IN_TRANSIT: { label: 'Đang chuyển kho', tone: 'info' },
  SOLD: { label: 'Đã bán', tone: 'neutral' },
  REPAIRING: { label: 'Đang sửa chữa', tone: 'warning' },
  QUARANTINED: { label: 'Đang cách ly', tone: 'danger' },
  WRITTEN_OFF: { label: 'Đã loại khỏi kho', tone: 'neutral' },
};

const INSPECTION_STATUS_PRESENTATION: Record<
  InventoryInspectionStatus,
  InventoryStatusPresentation
> = {
  DRAFT: { label: 'Bản nháp', tone: 'warning' },
  COMPLETED: { label: 'Đã hoàn tất', tone: 'success' },
};

const INSPECTION_RESULT_PRESENTATION: Record<
  InventoryInspectionResult,
  InventoryStatusPresentation
> = {
  INCOMPLETE: { label: 'Chưa hoàn tất', tone: 'neutral' },
  PASSED: { label: 'Đạt', tone: 'success' },
  PARTIAL: { label: 'Cần xử lý', tone: 'warning' },
  FAILED: { label: 'Không đạt', tone: 'danger' },
};

const INSPECTION_TYPE_LABEL: Record<InventoryInspectionType, string> = {
  INTAKE: 'Kiểm định nhập kho',
  RETURN: 'Kiểm định hàng hoàn',
  WARRANTY: 'Kiểm định bảo hành',
  PRE_SALE: 'Kiểm định trước khi bán',
};

const STOCK_MOVEMENT_LABEL: Record<InventoryStockMovementType, string> = {
  RECEIPT: 'Nhập kho',
  SALE: 'Xuất bán',
  RETURN: 'Hoàn kho',
  TRANSFER: 'Chuyển kho',
  ADJUSTMENT_IN: 'Điều chỉnh tăng',
  ADJUSTMENT_OUT: 'Điều chỉnh giảm',
  WRITE_OFF: 'Xuất loại',
};

const INSPECTION_CHECK_PRESENTATION: Record<
  InventoryInspectionCheckStatus,
  InventoryStatusPresentation
> = {
  PASS: { label: 'Đạt', tone: 'success' },
  FAIL: { label: 'Không đạt', tone: 'danger' },
  DEGRADED: { label: 'Hoạt động chưa tốt', tone: 'warning' },
  NOT_TESTED: { label: 'Chưa kiểm tra', tone: 'neutral' },
  NOT_APPLICABLE: { label: 'Không áp dụng', tone: 'neutral' },
  UNKNOWN: { label: 'Chưa xác định', tone: 'warning' },
};

export function inventoryLifecyclePresentation(
  status: InventoryLifecycleStatus,
): InventoryStatusPresentation {
  return LIFECYCLE_PRESENTATION[status];
}

export function inventoryLifecycleLabel(status: InventoryLifecycleStatus): string {
  return inventoryLifecyclePresentation(status).label;
}

export function inspectionStatusPresentation(
  status: InventoryInspectionStatus,
): InventoryStatusPresentation {
  return INSPECTION_STATUS_PRESENTATION[status];
}

export function inspectionStatusLabel(status: InventoryInspectionStatus): string {
  return inspectionStatusPresentation(status).label;
}

export function inspectionResultPresentation(
  result: InventoryInspectionResult,
): InventoryStatusPresentation {
  return INSPECTION_RESULT_PRESENTATION[result];
}

export function inspectionResultLabel(result: InventoryInspectionResult): string {
  return inspectionResultPresentation(result).label;
}

export function inspectionTypeLabel(type: InventoryInspectionType): string {
  return INSPECTION_TYPE_LABEL[type];
}

export function stockMovementLabel(type: InventoryStockMovementType): string {
  return STOCK_MOVEMENT_LABEL[type];
}

export function stockLevelPresentation(
  availableQuantity: number,
  lowStock: boolean,
): InventoryStatusPresentation {
  if (availableQuantity <= 0) return { label: 'Hết hàng', tone: 'danger' };
  if (lowStock) return { label: 'Sắp hết hàng', tone: 'warning' };
  return { label: 'Đủ hàng', tone: 'success' };
}

export function inspectionCheckStatusPresentation(
  status: InventoryInspectionCheckStatus,
): InventoryStatusPresentation {
  return INSPECTION_CHECK_PRESENTATION[status];
}

export function inspectionCheckStatusLabel(status: InventoryInspectionCheckStatus): string {
  return inspectionCheckStatusPresentation(status).label;
}
