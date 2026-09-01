export const INTAKE_FIELD_ORDER = [
  'productId',
  'variantId',
  'locationId',
  'imei1',
  'imei2',
  'serial',
  'eid',
  'salePrice',
  'compareAtPrice',
  'modelNumber',
  'regionCode',
  'simLockStatus',
  'carrierName',
  'simConfiguration',
  'warrantyDaysOverride',
] as const;

export type IntakeField = (typeof INTAKE_FIELD_ORDER)[number];
export type IntakeFieldErrors = Partial<Record<IntakeField, string>>;

export interface InventoryIntakeDraft {
  readonly productId: string;
  readonly variantId: string;
  readonly locationId: string;
  readonly imei1: string;
  readonly imei2: string;
  readonly serial: string;
  readonly eid: string;
  readonly salePrice: string;
  readonly compareAtPrice: string;
  readonly modelNumber: string;
  readonly regionCode: string;
  readonly simLockStatus: string;
  readonly carrierName: string;
  readonly simConfiguration: string;
  readonly warrantyDaysOverride: string;
}

export function inventoryIntakeProductSelection(productId: string) {
  return { productId, variantId: '' } as const;
}

export function inventoryIntakeProductForSelection<Product extends { readonly id: string }>(
  product: Product | null,
  productId: string,
): Product | null {
  return product?.id === productId ? product : null;
}

export function inventoryIntakeVariantIsSelectable(
  variants: readonly { readonly id: string }[],
  variantId: string,
): boolean {
  return variantId !== '' && variants.some((variant) => variant.id === variantId);
}

const MONEY_PATTERN = /^\d{1,15}$/;
const WARRANTY_PATTERN = /^\d+$/;
const SIM_LOCK_STATUSES = new Set(['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN']);
const SIM_CONFIGURATIONS = new Set([
  'SINGLE_PHYSICAL',
  'DUAL_PHYSICAL',
  'PHYSICAL_AND_ESIM',
  'ESIM_ONLY',
  'UNKNOWN',
]);

export function validateInventoryIntakeDraft(draft: InventoryIntakeDraft): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {};
  const imei1 = normalizeImei(draft.imei1);
  const imei2 = normalizeImei(draft.imei2);
  const serial = normalizeSerial(draft.serial);
  const eid = normalizeEid(draft.eid);
  const salePrice = draft.salePrice.trim();
  const compareAtPrice = draft.compareAtPrice.trim();
  const warrantyDays = draft.warrantyDaysOverride.trim();

  if (draft.productId.trim() === '') errors.productId = 'Hãy chọn dòng iPhone.';
  if (draft.variantId.trim() === '') errors.variantId = 'Hãy chọn cấu hình máy.';
  if (draft.locationId.trim() === '') errors.locationId = 'Hãy chọn địa điểm nhận máy.';

  if (imei1 === '' && serial === '') {
    errors.imei1 = 'Nhập IMEI chính hoặc số sê-ri để nhận diện máy.';
  } else if (imei1 !== '' && !isValidImei(imei1)) {
    errors.imei1 = 'IMEI chính phải gồm 15 chữ số hợp lệ.';
  }

  if (imei2 !== '' && !isValidImei(imei2)) {
    errors.imei2 = 'IMEI phụ phải gồm 15 chữ số hợp lệ.';
  } else if (imei1 !== '' && imei1 === imei2) {
    errors.imei2 = 'IMEI phụ phải khác IMEI chính.';
  }

  if (serial !== '' && !/^[A-Z0-9]{6,32}$/.test(serial)) {
    errors.serial = 'Số sê-ri phải gồm 6–32 chữ cái hoặc chữ số.';
  }
  if (eid !== '' && !/^\d{32}$/.test(eid)) {
    errors.eid = 'EID phải gồm đúng 32 chữ số.';
  }

  if (salePrice === '') {
    errors.salePrice = 'Hãy nhập giá bán.';
  } else if (!MONEY_PATTERN.test(salePrice)) {
    errors.salePrice = 'Giá bán phải gồm tối đa 15 chữ số.';
  }
  if (compareAtPrice !== '' && !MONEY_PATTERN.test(compareAtPrice)) {
    errors.compareAtPrice = 'Giá niêm yết phải gồm tối đa 15 chữ số.';
  } else if (
    MONEY_PATTERN.test(salePrice) &&
    MONEY_PATTERN.test(compareAtPrice) &&
    BigInt(compareAtPrice) < BigInt(salePrice)
  ) {
    errors.compareAtPrice = 'Giá niêm yết phải lớn hơn hoặc bằng giá bán.';
  }

  if (draft.modelNumber.trim().length > 255) {
    errors.modelNumber = 'Mã kiểu máy không được vượt quá 255 ký tự.';
  }
  if (draft.regionCode.trim().length > 255) {
    errors.regionCode = 'Mã thị trường không được vượt quá 255 ký tự.';
  }
  if (!SIM_LOCK_STATUSES.has(draft.simLockStatus)) {
    errors.simLockStatus = 'Hãy chọn tình trạng khóa mạng.';
  }
  if (draft.simLockStatus === 'CARRIER_LOCKED' && draft.carrierName.trim() === '') {
    errors.carrierName = 'Hãy nhập tên nhà mạng đang khóa máy.';
  } else if (draft.carrierName.trim().length > 255) {
    errors.carrierName = 'Tên nhà mạng không được vượt quá 255 ký tự.';
  }
  if (!SIM_CONFIGURATIONS.has(draft.simConfiguration)) {
    errors.simConfiguration = 'Hãy chọn cấu hình SIM.';
  }

  if (warrantyDays !== '') {
    if (!WARRANTY_PATTERN.test(warrantyDays)) {
      errors.warrantyDaysOverride = 'Số ngày bảo hành phải là số nguyên.';
    } else if (Number(warrantyDays) > 3650) {
      errors.warrantyDaysOverride = 'Thời hạn bảo hành không được vượt quá 3.650 ngày.';
    }
  }

  return errors;
}

export function inventoryIntakeServerFieldErrors(
  value: unknown,
  draft: InventoryIntakeDraft,
): IntakeFieldErrors {
  const body = errorBody(value);
  if (body === undefined || !Array.isArray(body.details)) return {};

  const errors: IntakeFieldErrors = {};
  for (const detail of body.details) {
    if (!isRecord(detail) || typeof detail.code !== 'string') continue;
    const field = intakeFieldFromDetail(detail.field, detail.code, draft);
    if (field === undefined || errors[field] !== undefined) continue;
    errors[field] = serverDetailMessage(field, detail.code);
  }
  return errors;
}

export function firstInventoryIntakeErrorField(errors: IntakeFieldErrors): IntakeField | undefined {
  return INTAKE_FIELD_ORDER.find((field) => errors[field] !== undefined);
}

export function inventoryIntakeErrorItems(errors: IntakeFieldErrors) {
  return INTAKE_FIELD_ORDER.flatMap((field) => {
    const message = errors[field];
    return message === undefined ? [] : [{ href: `#intake-${field}` as const, message }];
  });
}

function intakeFieldFromDetail(
  rawField: unknown,
  code: string,
  draft: InventoryIntakeDraft,
): IntakeField | undefined {
  const field = typeof rawField === 'string' ? rawField.split('.').at(-1) : undefined;
  if (field !== undefined && isIntakeField(field)) return field;
  if (field !== 'identifiers') return undefined;

  if (code === 'INVALID_SERIAL') return 'serial';
  if (code === 'INVALID_EID') return 'eid';
  if (code === 'INVALID_IMEI') {
    if (draft.imei1.trim() !== '' && !isValidImei(normalizeImei(draft.imei1))) return 'imei1';
    if (draft.imei2.trim() !== '' && !isValidImei(normalizeImei(draft.imei2))) return 'imei2';
    return draft.imei1.trim() === '' && draft.imei2.trim() !== '' ? 'imei2' : 'imei1';
  }
  return undefined;
}

function serverDetailMessage(field: IntakeField, code: string): string {
  const message = SERVER_DETAIL_MESSAGES[code];
  if (message !== undefined) return message;

  if (field === 'variantId') return 'Cấu hình đã chọn không còn dùng được. Hãy chọn lại.';
  if (field === 'locationId') return 'Địa điểm nhận máy không còn dùng được. Hãy chọn lại.';
  if (field === 'salePrice') return 'Giá bán chưa đúng định dạng.';
  if (field === 'compareAtPrice') return 'Giá niêm yết chưa đúng định dạng.';
  if (field === 'warrantyDaysOverride') return 'Thời hạn bảo hành chưa hợp lệ.';
  if (field === 'simLockStatus') return 'Tình trạng khóa mạng chưa hợp lệ.';
  if (field === 'simConfiguration') return 'Cấu hình SIM chưa hợp lệ.';
  if (field === 'modelNumber') return 'Mã kiểu máy chưa hợp lệ.';
  if (field === 'regionCode') return 'Mã thị trường chưa hợp lệ.';
  return 'Thông tin tại mục này chưa hợp lệ.';
}

function normalizeImei(value: string): string {
  return value.replace(/[\s-]+/g, '');
}

function normalizeSerial(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeEid(value: string): string {
  return value.replace(/\s+/g, '');
}

function isValidImei(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function errorBody(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return isRecord(value.error) ? value.error : value;
}

function isIntakeField(value: string): value is IntakeField {
  return (INTAKE_FIELD_ORDER as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const SERVER_DETAIL_MESSAGES: Readonly<Record<string, string>> = {
  CARRIER_REQUIRED: 'Hãy nhập tên nhà mạng đang khóa máy.',
  CARRIER_FORBIDDEN: 'Chỉ nhập nhà mạng khi máy đang bị khóa mạng.',
  COMPARE_AT_PRICE_TOO_LOW: 'Giá niêm yết phải lớn hơn hoặc bằng giá bán.',
  IMEI_SLOTS_MUST_DIFFER: 'IMEI phụ phải khác IMEI chính.',
  INVALID_IMEI: 'IMEI phải gồm 15 chữ số hợp lệ.',
  INVALID_SERIAL: 'Số sê-ri phải gồm 6–32 chữ cái hoặc chữ số.',
  INVALID_EID: 'EID phải gồm đúng 32 chữ số.',
  INVALID_INTAKE_TARGET: 'Dòng máy hoặc cấu hình đã ngừng bán. Hãy chọn lại.',
};
