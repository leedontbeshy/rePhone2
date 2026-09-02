import { describe, expect, it } from 'vitest';
import type { StoreSettings } from '@/lib/system-admin-api';
import {
  changedSettingsFields,
  formatSettingsDays,
  formatSettingsDuration,
  formatSettingsMoney,
  hasSettingsChanges,
  qrFileReadyForUpload,
  settingsToDraft,
  validateQrFile,
  validateSettingsDraft,
} from './settings-model';

const SETTINGS: StoreSettings = {
  bankAccountHolder: 'REPHONE',
  bankAccountNumber: '0123456789',
  bankName: 'Ngân hàng Demo',
  bankQrUrl: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  currency: 'VND',
  defaultShippingFee: '30000',
  defaultWarrantyDays: 180,
  defaultWarrantyTerms: 'Điều khoản bảo hành',
  depositProofWindowMinutes: 30,
  depositReviewWindowMinutes: 60,
  pickupHoldMinutes: 120,
  shippingDepositAmount: '500000',
  storeAddress: '123 Đường Demo',
  storeName: 'rePhone',
  storePhone: '0900000000',
  timezone: 'Asia/Ho_Chi_Minh',
  updatedAt: '2026-08-30T00:00:00.000Z',
  updatedBy: { id: 'admin-id', fullName: 'Quản trị viên Demo' },
  version: 4,
};

describe('settings model', () => {
  it('builds a minimal patch and trims changed text', () => {
    const draft = settingsToDraft(SETTINGS);
    draft.storeName = '  rePhone Sài Gòn  ';

    expect(validateSettingsDraft(SETTINGS, draft)).toEqual({
      errors: {},
      input: { expectedVersion: 4, storeName: 'rePhone Sài Gòn' },
    });
    expect(hasSettingsChanges(SETTINGS, draft)).toBe(true);
  });

  it('treats an unchanged draft as clean', () => {
    const draft = settingsToDraft(SETTINGS);

    expect(validateSettingsDraft(SETTINGS, draft)).toEqual({
      errors: {},
      input: { expectedVersion: 4 },
    });
    expect(hasSettingsChanges(SETTINGS, draft)).toBe(false);
  });

  it('normalizes whitespace-only edits into an empty patch', () => {
    const draft = settingsToDraft(SETTINGS);
    draft.storeName = '  rePhone  ';

    expect(hasSettingsChanges(SETTINGS, draft)).toBe(true);
    expect(validateSettingsDraft(SETTINGS, draft)).toEqual({
      errors: {},
      input: { expectedVersion: 4 },
    });
    expect(changedSettingsFields(SETTINGS, draft)).toEqual([]);
  });

  it('compares numeric formatting by value when rebasing a conflict', () => {
    const draft = settingsToDraft(SETTINGS);
    draft.pickupHoldMinutes = '00120';
    draft.defaultShippingFee = '030000';

    expect(changedSettingsFields(SETTINGS, draft)).toEqual([]);
  });

  it('returns field-specific messages for invalid money and time values', () => {
    const draft = settingsToDraft(SETTINGS);
    draft.defaultShippingFee = '-1';
    draft.shippingDepositAmount = '0';
    draft.pickupHoldMinutes = '10081';
    draft.defaultWarrantyDays = '2.5';

    const validation = validateSettingsDraft(SETTINGS, draft);

    expect(validation.input).toBeUndefined();
    expect(validation.errors.defaultShippingFee).toContain('không âm');
    expect(validation.errors.shippingDepositAmount).toContain('lớn hơn 0');
    expect(validation.errors.pickupHoldMinutes).toContain('10.080');
    expect(validation.errors.defaultWarrantyDays).toContain('3.650');
    expect(hasSettingsChanges(SETTINGS, draft)).toBe(true);
  });

  it('accepts 15-digit money values and rejects 16 digits', () => {
    const accepted = settingsToDraft(SETTINGS);
    accepted.defaultShippingFee = '999999999999999';
    accepted.shippingDepositAmount = '100000000000000';

    expect(validateSettingsDraft(SETTINGS, accepted).errors).toEqual({});

    const rejected = settingsToDraft(SETTINGS);
    rejected.defaultShippingFee = '1000000000000000';
    rejected.shippingDepositAmount = '1000000000000000';

    const validation = validateSettingsDraft(SETTINGS, rejected);
    expect(validation.input).toBeUndefined();
    expect(validation.errors.defaultShippingFee).toContain('15 chữ số');
    expect(validation.errors.shippingDepositAmount).toContain('15 chữ số');
  });

  it('validates QR type, size and empty files before upload', () => {
    expect(validateQrFile(new File(['ok'], 'qr.png', { type: 'image/png' }))).toBeUndefined();
    expect(validateQrFile(new File(['ok'], 'qr.svg', { type: 'image/svg+xml' }))).toContain('JPEG');
    expect(validateQrFile(new File([], 'empty.png', { type: 'image/png' }))).toContain(
      'không có dữ liệu',
    );
    expect(
      validateQrFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.webp', {
          type: 'image/webp',
        }),
      ),
    ).toContain('5 MiB');
  });

  it('keeps a valid selected QR eligible when retrying after a request error', () => {
    const selected = new File(['qr-data'], 'qr.png', { type: 'image/png' });

    expect(qrFileReadyForUpload(selected)).toBe(true);
    expect(qrFileReadyForUpload(undefined)).toBe(false);
    expect(qrFileReadyForUpload(new File(['not-qr'], 'qr.pdf', { type: 'application/pdf' }))).toBe(
      false,
    );
  });

  it('formats applied values for the settings summary without changing source data', () => {
    expect(formatSettingsMoney('30000')).toBe('30.000 đ');
    expect(formatSettingsMoney('100000000000000')).toBe('100.000.000.000.000 đ');
    expect(formatSettingsDuration(30)).toBe('30 phút');
    expect(formatSettingsDuration(120)).toBe('2 giờ');
    expect(formatSettingsDuration(2_880)).toBe('2 ngày');
    expect(formatSettingsDays(0)).toBe('0 ngày');
    expect(formatSettingsDays(180)).toBe('180 ngày');
  });
});
