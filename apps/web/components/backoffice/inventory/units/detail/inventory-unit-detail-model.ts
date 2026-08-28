import type {
  InventoryAvailabilityReadinessReason,
  InventoryUnitAction,
  InventoryUnitDetail,
  UpdateInventoryUnitInput,
} from '@/lib/backoffice-inventory-api';

export interface InventoryUnitEditDraft {
  readonly carrierName: string;
  readonly compareAtPrice: string;
  readonly modelNumber: string;
  readonly regionCode: string;
  readonly salePrice: string;
  readonly simConfiguration: InventoryUnitDetail['simConfiguration'];
  readonly simLockStatus: InventoryUnitDetail['simLockStatus'];
  readonly warrantyDaysOverride: string;
}

export interface InventoryIdentifierCorrectionDraft {
  readonly eid: string;
  readonly imei1: string;
  readonly imei2: string;
  readonly reason: string;
  readonly serial: string;
}

export type InventoryUnitUpdateField = keyof InventoryUnitEditDraft | 'form';
export type InventoryIdentifierCorrectionField = keyof InventoryIdentifierCorrectionDraft | 'form';

export type InventoryUnitUpdateResult =
  | { readonly input: UpdateInventoryUnitInput; readonly ok: true }
  | {
      readonly errors: Partial<Record<InventoryUnitUpdateField, string>>;
      readonly ok: false;
    };

export type InventoryIdentifierCorrectionResult =
  | { readonly input: UpdateInventoryUnitInput; readonly ok: true }
  | {
      readonly errors: Partial<Record<InventoryIdentifierCorrectionField, string>>;
      readonly ok: false;
    };

export const LIFECYCLE_ACTIONS = [
  'MAKE_AVAILABLE',
  'SEND_TO_REPAIR',
  'QUARANTINE',
  'TRANSFER',
  'WRITE_OFF',
] as const satisfies readonly InventoryUnitAction[];

const READINESS_LABELS: Readonly<Record<InventoryAvailabilityReadinessReason, string>> = {
  STATUS_NOT_INSPECTING: 'Máy cần ở trạng thái đang kiểm định.',
  INSPECTION_REQUIRED: 'Chưa có phiếu kiểm định hoàn tất.',
  INSPECTION_NOT_PASSED: 'Kết quả kiểm định gần nhất chưa đạt.',
  ACTIVE_RESERVATION: 'Máy đang được giữ cho một đơn hàng.',
  SALE_PRICE_REQUIRED: 'Chưa có giá bán.',
  LOCATION_INACTIVE: 'Địa điểm hiện tại đang ngừng hoạt động.',
  VARIANT_INACTIVE: 'Phiên bản sản phẩm đang ngừng hoạt động.',
  PRODUCT_INACTIVE: 'Sản phẩm đang ngừng hoạt động.',
  IDENTIFIER_REQUIRED: 'Chưa có mã định danh thiết bị.',
  MEDIA_REQUIRED: 'Chưa có ảnh thực tế của máy.',
};

export function inventoryUnitEditDraft(unit: InventoryUnitDetail): InventoryUnitEditDraft {
  return {
    carrierName: unit.carrierName ?? '',
    compareAtPrice: unit.compareAtPrice ?? '',
    modelNumber: unit.modelNumber ?? '',
    regionCode: unit.regionCode ?? '',
    salePrice: unit.salePrice ?? '',
    simConfiguration: unit.simConfiguration,
    simLockStatus: unit.simLockStatus,
    warrantyDaysOverride:
      unit.warrantyDaysOverride === null ? '' : String(unit.warrantyDaysOverride),
  };
}

export function emptyIdentifierCorrectionDraft(): InventoryIdentifierCorrectionDraft {
  return { eid: '', imei1: '', imei2: '', reason: '', serial: '' };
}

export function buildInventoryUnitUpdate(
  unit: InventoryUnitDetail,
  draft: InventoryUnitEditDraft,
): InventoryUnitUpdateResult {
  const errors: Partial<Record<InventoryUnitUpdateField, string>> = {};
  const salePrice = optionalMoney(draft.salePrice, 'salePrice', errors);
  const compareAtPrice = optionalMoney(draft.compareAtPrice, 'compareAtPrice', errors);
  const warrantyDaysOverride = optionalWarrantyDays(draft.warrantyDaysOverride, errors);
  if (Object.keys(errors).length > 0) return { errors, ok: false };

  const input: UpdateInventoryUnitInput = {};
  const modelNumber = draft.modelNumber.trim();
  const regionCode = draft.regionCode.trim();
  const carrierName = draft.carrierName.trim();

  if (modelNumber !== '' && modelNumber !== (unit.modelNumber ?? ''))
    input.modelNumber = modelNumber;
  if (regionCode !== '' && regionCode !== (unit.regionCode ?? '')) input.regionCode = regionCode;
  if (carrierName !== (unit.carrierName ?? '')) input.carrierName = carrierName || null;
  if (draft.simLockStatus !== unit.simLockStatus) input.simLockStatus = draft.simLockStatus;
  if (draft.simConfiguration !== unit.simConfiguration) {
    input.simConfiguration = draft.simConfiguration;
  }
  if (salePrice !== undefined && salePrice !== unit.salePrice) input.salePrice = salePrice;
  if (compareAtPrice !== undefined && compareAtPrice !== unit.compareAtPrice) {
    input.compareAtPrice = compareAtPrice;
  }
  if (warrantyDaysOverride !== undefined && warrantyDaysOverride !== unit.warrantyDaysOverride) {
    input.warrantyDaysOverride = warrantyDaysOverride;
  }

  if (Object.keys(input).length === 0) {
    return { errors: { form: 'Chưa có thay đổi nào để lưu.' }, ok: false };
  }
  return { input, ok: true };
}

export function buildIdentifierCorrection(
  draft: InventoryIdentifierCorrectionDraft,
): InventoryIdentifierCorrectionResult {
  const errors: Partial<Record<InventoryIdentifierCorrectionField, string>> = {};
  const values = {
    eid: draft.eid.trim(),
    imei1: draft.imei1.trim(),
    imei2: draft.imei2.trim(),
    serial: draft.serial.trim(),
  };
  if (Object.values(values).every((value) => value === '')) {
    errors.form = 'Nhập ít nhất một mã cần điều chỉnh.';
  }
  const reason = draft.reason.trim();
  if (reason.length < 5) errors.reason = 'Lý do cần ít nhất 5 ký tự.';
  if (reason.length > 500) errors.reason = 'Lý do không được quá 500 ký tự.';
  for (const [key, value] of Object.entries(values) as Array<[keyof typeof values, string]>) {
    if (value.length > 100) errors[key] = 'Mã không được quá 100 ký tự.';
  }
  if (Object.keys(errors).length > 0) return { errors, ok: false };

  return {
    input: {
      ...(values.imei1 === '' ? {} : { imei1: values.imei1 }),
      ...(values.imei2 === '' ? {} : { imei2: values.imei2 }),
      ...(values.serial === '' ? {} : { serial: values.serial }),
      ...(values.eid === '' ? {} : { eid: values.eid }),
      reason,
    },
    ok: true,
  };
}

export function readinessReasonLabel(reason: InventoryAvailabilityReadinessReason): string {
  return READINESS_LABELS[reason];
}

export function visibleLifecycleActions(
  availableActions: readonly InventoryUnitAction[],
): Array<(typeof LIFECYCLE_ACTIONS)[number]> {
  const allowed = new Set<InventoryUnitAction>(availableActions);
  return LIFECYCLE_ACTIONS.filter((action) => allowed.has(action));
}

function optionalMoney(
  value: string,
  field: 'salePrice' | 'compareAtPrice',
  errors: Partial<Record<InventoryUnitUpdateField, string>>,
): string | undefined {
  const normalized = value.trim();
  if (normalized === '') return undefined;
  if (!/^\d{1,15}$/.test(normalized)) {
    errors[field] = 'Nhập số tiền nguyên, tối đa 15 chữ số.';
    return undefined;
  }
  return normalized;
}

function optionalWarrantyDays(
  value: string,
  errors: Partial<Record<InventoryUnitUpdateField, string>>,
): number | undefined {
  const normalized = value.trim();
  if (normalized === '') return undefined;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 3650) {
    errors.warrantyDaysOverride = 'Số ngày bảo hành phải từ 0 đến 3.650.';
    return undefined;
  }
  return parsed;
}
