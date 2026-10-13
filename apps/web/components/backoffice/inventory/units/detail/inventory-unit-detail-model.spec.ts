import { describe, expect, it } from 'vitest';
import type { InventoryUnitDetail } from '@/lib/backoffice-inventory-api';
import {
  buildIdentifierCorrection,
  buildInventoryUnitUpdate,
  inventoryUnitEditDraft,
  readinessReasonLabel,
  visibleLifecycleActions,
} from './inventory-unit-detail-model';

describe('FE-06 inventory unit detail model', () => {
  it('builds a typed patch without identifier or cost fields', () => {
    const unit = inventoryUnit();
    const result = buildInventoryUnitUpdate(unit, {
      ...inventoryUnitEditDraft(unit),
      carrierName: '',
      salePrice: '12900000',
      simLockStatus: 'CARRIER_LOCKED',
      warrantyDaysOverride: '180',
    });

    expect(result).toEqual({
      input: {
        carrierName: null,
        salePrice: '12900000',
        simLockStatus: 'CARRIER_LOCKED',
        warrantyDaysOverride: 180,
      },
      ok: true,
    });
  });

  it('requires an audited reason and at least one new identifier', () => {
    expect(
      buildIdentifierCorrection({ eid: '', imei1: '', imei2: '', reason: 'sai', serial: '' }),
    ).toEqual({
      errors: {
        form: 'Nhập ít nhất một mã cần điều chỉnh.',
        reason: 'Lý do cần ít nhất 5 ký tự.',
      },
      ok: false,
    });

    expect(
      buildIdentifierCorrection({
        eid: '',
        imei1: ' 351111111111111 ',
        imei2: '',
        reason: 'Đối chiếu lại phiếu nhập kho',
        serial: '',
      }),
    ).toEqual({
      input: {
        imei1: '351111111111111',
        reason: 'Đối chiếu lại phiếu nhập kho',
      },
      ok: true,
    });
  });

  it('uses backend actions as the only lifecycle action source', () => {
    expect(
      visibleLifecycleActions(['UPLOAD_MEDIA', 'TRANSFER', 'CREATE_INSPECTION', 'QUARANTINE']),
    ).toEqual(['QUARANTINE', 'TRANSFER']);
    expect(visibleLifecycleActions([])).toEqual([]);
  });

  it('presents readiness reasons in customer-safe Vietnamese', () => {
    expect(readinessReasonLabel('MEDIA_REQUIRED')).toBe('Chưa có ảnh thực tế của máy.');
    expect(readinessReasonLabel('INSPECTION_NOT_PASSED')).toBe(
      'Kết quả kiểm định gần nhất chưa đạt.',
    );
  });
});

function inventoryUnit(): InventoryUnitDetail {
  return {
    isFeatured: false,
    activeReservationCount: 0,
    availabilityReadiness: { isReady: false, reasons: ['SALE_PRICE_REQUIRED'] },
    availableActions: ['CREATE_INSPECTION', 'UPLOAD_MEDIA'],
    carrierName: 'Viettel',
    compareAtPrice: null,
    currentInspection: null,
    id: 'unit-id',
    inventoryCode: 'RPH-000001',
    lifecycleStatus: 'INSPECTING',
    location: {
      code: 'HCM-01',
      id: 'location-id',
      name: 'Chi nhánh Quận 1',
      status: 'ACTIVE',
      type: 'STORE',
    },
    maskedIdentifiers: [{ maskedValue: '***********1111', type: 'IMEI_1' }],
    media: [],
    mediaCount: 0,
    modelNumber: 'A2890',
    product: { id: 'product-id', name: 'iPhone 15', slug: 'iphone-15', status: 'ACTIVE' },
    receivedAt: '2026-08-28T10:00:00.000Z',
    regionCode: 'VN/A',
    salePrice: null,
    simConfiguration: 'PHYSICAL_AND_ESIM',
    simLockStatus: 'UNLOCKED',
    updatedAt: '2026-08-28T10:00:00.000Z',
    variant: {
      displayName: 'iPhone 15 128 GB',
      id: 'variant-id',
      sku: 'IP15-128-BLK',
      status: 'ACTIVE',
    },
    warrantyDaysOverride: null,
  };
}
