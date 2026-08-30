import type { StoreSettings, UpdateSettingsInput } from '@/lib/system-admin-api';

export interface SettingsDraft {
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankName: string;
  defaultShippingFee: string;
  defaultWarrantyDays: string;
  defaultWarrantyTerms: string;
  depositProofWindowMinutes: string;
  depositReviewWindowMinutes: string;
  pickupHoldMinutes: string;
  shippingDepositAmount: string;
  storeAddress: string;
  storeName: string;
  storePhone: string;
}

export type SettingsField = keyof SettingsDraft;
export type SettingsErrors = Partial<Record<SettingsField, string>>;

export interface SettingsValidation {
  errors: SettingsErrors;
  input?: UpdateSettingsInput;
}

const MONEY_PATTERN = /^\d{1,15}$/;
const POSITIVE_MONEY_PATTERN = /^[1-9]\d{0,14}$/;

export function settingsToDraft(settings: StoreSettings): SettingsDraft {
  return {
    bankAccountHolder: settings.bankAccountHolder,
    bankAccountNumber: settings.bankAccountNumber,
    bankName: settings.bankName,
    defaultShippingFee: settings.defaultShippingFee,
    defaultWarrantyDays: String(settings.defaultWarrantyDays),
    defaultWarrantyTerms: settings.defaultWarrantyTerms,
    depositProofWindowMinutes: String(settings.depositProofWindowMinutes),
    depositReviewWindowMinutes: String(settings.depositReviewWindowMinutes),
    pickupHoldMinutes: String(settings.pickupHoldMinutes),
    shippingDepositAmount: settings.shippingDepositAmount,
    storeAddress: settings.storeAddress,
    storeName: settings.storeName,
    storePhone: settings.storePhone,
  };
}

export function validateSettingsDraft(
  settings: StoreSettings,
  draft: SettingsDraft,
): SettingsValidation {
  const errors: SettingsErrors = {};
  const text = normalizedText(draft, errors);
  const pickupHoldMinutes = boundedInteger(
    draft.pickupHoldMinutes,
    1,
    10_080,
    'Thời gian giữ máy phải từ 1 đến 10.080 phút.',
    'pickupHoldMinutes',
    errors,
  );
  const depositProofWindowMinutes = boundedInteger(
    draft.depositProofWindowMinutes,
    1,
    10_080,
    'Thời hạn gửi minh chứng phải từ 1 đến 10.080 phút.',
    'depositProofWindowMinutes',
    errors,
  );
  const depositReviewWindowMinutes = boundedInteger(
    draft.depositReviewWindowMinutes,
    1,
    10_080,
    'Thời gian duyệt thanh toán phải từ 1 đến 10.080 phút.',
    'depositReviewWindowMinutes',
    errors,
  );
  const defaultWarrantyDays = boundedInteger(
    draft.defaultWarrantyDays,
    0,
    3650,
    'Thời hạn bảo hành phải từ 0 đến 3.650 ngày.',
    'defaultWarrantyDays',
    errors,
  );

  if (!MONEY_PATTERN.test(draft.defaultShippingFee)) {
    errors.defaultShippingFee = 'Phí giao hàng phải là số nguyên không âm, tối đa 15 chữ số.';
  }
  if (!POSITIVE_MONEY_PATTERN.test(draft.shippingDepositAmount)) {
    errors.shippingDepositAmount = 'Tiền đặt trước phải là số nguyên lớn hơn 0, tối đa 15 chữ số.';
  }
  if (Object.keys(errors).length > 0) return { errors };

  const input: UpdateSettingsInput = { expectedVersion: settings.version };
  assignChanged(input, 'storeName', text.storeName, settings.storeName);
  assignChanged(input, 'storePhone', text.storePhone, settings.storePhone);
  assignChanged(input, 'storeAddress', text.storeAddress, settings.storeAddress);
  assignChanged(input, 'defaultShippingFee', draft.defaultShippingFee, settings.defaultShippingFee);
  assignChanged(
    input,
    'shippingDepositAmount',
    draft.shippingDepositAmount,
    settings.shippingDepositAmount,
  );
  assignChanged(input, 'pickupHoldMinutes', pickupHoldMinutes, settings.pickupHoldMinutes);
  assignChanged(
    input,
    'depositProofWindowMinutes',
    depositProofWindowMinutes,
    settings.depositProofWindowMinutes,
  );
  assignChanged(
    input,
    'depositReviewWindowMinutes',
    depositReviewWindowMinutes,
    settings.depositReviewWindowMinutes,
  );
  assignChanged(input, 'defaultWarrantyDays', defaultWarrantyDays, settings.defaultWarrantyDays);
  assignChanged(
    input,
    'defaultWarrantyTerms',
    text.defaultWarrantyTerms,
    settings.defaultWarrantyTerms,
  );
  assignChanged(input, 'bankName', text.bankName, settings.bankName);
  assignChanged(input, 'bankAccountNumber', text.bankAccountNumber, settings.bankAccountNumber);
  assignChanged(input, 'bankAccountHolder', text.bankAccountHolder, settings.bankAccountHolder);

  return { errors, input };
}

export function hasSettingsChanges(settings: StoreSettings, draft: SettingsDraft): boolean {
  const current = settingsToDraft(settings);
  return (Object.keys(current) as SettingsField[]).some((field) => draft[field] !== current[field]);
}

export function changedSettingsFields(
  settings: StoreSettings,
  draft: SettingsDraft,
): SettingsField[] {
  const current = comparableDraft(settingsToDraft(settings));
  const candidate = comparableDraft(draft);
  return (Object.keys(current) as SettingsField[]).filter(
    (field) => candidate[field] !== current[field],
  );
}

export function validateQrFile(file: File): string | undefined {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.';
  }
  if (file.size > 5 * 1024 * 1024) return 'Ảnh QR không được vượt quá 5 MiB.';
  if (file.size === 0) return 'Tệp đã chọn không có dữ liệu.';
  return undefined;
}

export function formatSettingsMoney(value: string): string {
  if (!/^\d+$/.test(value)) return value;
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} đ`;
}

export function formatSettingsDuration(minutes: number): string {
  if (minutes >= 1_440 && minutes % 1_440 === 0) {
    return `${new Intl.NumberFormat('vi-VN').format(minutes / 1_440)} ngày`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${new Intl.NumberFormat('vi-VN').format(minutes / 60)} giờ`;
  }
  return `${new Intl.NumberFormat('vi-VN').format(minutes)} phút`;
}

export function formatSettingsDays(days: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(days)} ngày`;
}

function normalizedText(draft: SettingsDraft, errors: SettingsErrors): SettingsDraft {
  const normalized: SettingsDraft = {
    bankAccountHolder: draft.bankAccountHolder.trim(),
    bankAccountNumber: draft.bankAccountNumber.trim(),
    bankName: draft.bankName.trim(),
    defaultShippingFee: draft.defaultShippingFee.trim(),
    defaultWarrantyDays: draft.defaultWarrantyDays.trim(),
    defaultWarrantyTerms: draft.defaultWarrantyTerms.trim(),
    depositProofWindowMinutes: draft.depositProofWindowMinutes.trim(),
    depositReviewWindowMinutes: draft.depositReviewWindowMinutes.trim(),
    pickupHoldMinutes: draft.pickupHoldMinutes.trim(),
    shippingDepositAmount: draft.shippingDepositAmount.trim(),
    storeAddress: draft.storeAddress.trim(),
    storeName: draft.storeName.trim(),
    storePhone: draft.storePhone.trim(),
  };
  const required: Array<[SettingsField, string]> = [
    ['storeName', 'Nhập tên cửa hàng.'],
    ['storePhone', 'Nhập số điện thoại cửa hàng.'],
    ['storeAddress', 'Nhập địa chỉ cửa hàng.'],
    ['defaultWarrantyTerms', 'Nhập điều khoản bảo hành mặc định.'],
    ['bankName', 'Nhập tên ngân hàng.'],
    ['bankAccountNumber', 'Nhập số tài khoản.'],
    ['bankAccountHolder', 'Nhập tên chủ tài khoản.'],
  ];
  for (const [field, message] of required) {
    if (normalized[field] === '') errors[field] = message;
  }
  return normalized;
}

function comparableDraft(draft: SettingsDraft): SettingsDraft {
  const comparable = { ...draft };
  for (const field of Object.keys(comparable) as SettingsField[]) {
    comparable[field] = comparable[field].trim();
  }
  for (const field of ['defaultShippingFee', 'shippingDepositAmount'] satisfies SettingsField[]) {
    const value = comparable[field];
    if (/^\d{1,15}$/.test(value)) comparable[field] = BigInt(value).toString();
  }
  for (const field of [
    'defaultWarrantyDays',
    'depositProofWindowMinutes',
    'depositReviewWindowMinutes',
    'pickupHoldMinutes',
  ] satisfies SettingsField[]) {
    const value = comparable[field];
    if (/^\d+$/.test(value)) comparable[field] = String(Number(value));
  }
  return comparable;
}

function boundedInteger(
  value: string,
  min: number,
  max: number,
  message: string,
  field: SettingsField,
  errors: SettingsErrors,
): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors[field] = message;
  }
  return parsed;
}

function assignChanged<K extends keyof UpdateSettingsInput>(
  input: UpdateSettingsInput,
  key: K,
  value: UpdateSettingsInput[K],
  previous: UpdateSettingsInput[K],
) {
  if (value !== previous) input[key] = value;
}
