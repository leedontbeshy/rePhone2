import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryUnitDetail } from '@/lib/backoffice-inventory-api';
import { InventoryUnitDetailView } from './inventory-unit-detail-view';

describe('FE-06 InventoryUnitDetailView', () => {
  it('renders the persisted gallery, masked identifiers and Vietnamese readiness copy', () => {
    const markup = render(unit());

    expect(markup).toContain('Hình ảnh của máy');
    expect(markup).toContain('Ảnh tải lên');
    expect(markup).toContain('Chưa chọn ảnh');
    expect(markup).toContain('Dùng ảnh JPG, PNG hoặc WebP; tối đa 8 MB.');
    expect(markup).toContain('https://cdn.example.test/unit-front.webp');
    expect(markup).toContain('***********1111');
    expect(markup).not.toContain('351111111111111');
    expect(markup).toContain('Chưa có giá bán.');
    expect(markup).toContain('Chưa có phiếu kiểm định hoàn tất.');
  });

  it('renders lifecycle controls only from backend-provided available actions', () => {
    const markup = render(
      unit({ availableActions: ['UPLOAD_MEDIA', 'TRANSFER', 'QUARANTINE', 'CREATE_INSPECTION'] }),
    );

    expect(markup).toContain('data-inventory-action="QUARANTINE"');
    expect(markup).toContain('data-inventory-action="TRANSFER"');
    expect(markup).not.toContain('data-inventory-action="MAKE_AVAILABLE"');
    expect(markup).not.toContain('data-inventory-action="SEND_TO_REPAIR"');
    expect(markup).not.toContain('data-inventory-action="WRITE_OFF"');
  });

  it('shows inspector display information in inspection history', () => {
    const markup = render(unit());

    expect(markup).toContain('Nhân viên Demo · NV001');
    expect(markup).toContain('Tiếp tục kiểm định');
  });
});

function render(unitValue: InventoryUnitDetail): string {
  return renderToStaticMarkup(
    <InventoryUnitDetailView
      inspections={[
        {
          createdAt: '2026-08-28T10:00:00.000Z',
          id: 'inspection-id',
          inspectedAt: null,
          inspectionType: 'PRE_SALE',
          inspector: { employeeCode: 'NV001', fullName: 'Nhân viên Demo', id: 'employee-id' },
          inspectorId: 'employee-id',
          isCurrent: false,
          overallResult: 'INCOMPLETE',
          status: 'DRAFT',
          updatedAt: '2026-08-28T10:00:00.000Z',
        },
      ]}
      locations={[unitValue.location]}
      unit={unitValue}
      onClearIdentifiers={vi.fn()}
      onCreateInspection={vi.fn(() => Promise.resolve(true))}
      onLifecycleCommand={vi.fn(() => Promise.resolve(true))}
      onRevealIdentifiers={vi.fn(() => Promise.resolve(true))}
      onRefresh={vi.fn(() => Promise.resolve())}
      onUpdate={vi.fn(() => Promise.resolve(true))}
      onUpload={vi.fn(() => Promise.resolve(true))}
    />,
  );
}

function unit(overrides: Partial<InventoryUnitDetail> = {}): InventoryUnitDetail {
  return {
    isFeatured: false,
    activeReservationCount: 0,
    availabilityReadiness: {
      isReady: false,
      reasons: ['SALE_PRICE_REQUIRED', 'INSPECTION_REQUIRED'],
    },
    availableActions: ['CREATE_INSPECTION', 'UPLOAD_MEDIA'],
    carrierName: null,
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
    media: [
      {
        altText: 'Mặt trước máy',
        createdAt: '2026-08-28T10:00:00.000Z',
        fileSize: 1024,
        height: 1200,
        id: 'media-id',
        mimeType: 'image/webp',
        sortOrder: 0,
        url: 'https://cdn.example.test/unit-front.webp',
        width: 900,
      },
    ],
    mediaCount: 1,
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
    ...overrides,
  };
}
