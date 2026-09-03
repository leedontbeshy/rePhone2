import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import { buildUnitSpecificationGroups } from './unit-specification-groups-presenter';
import { UnitSpecificationGroups } from './unit-specification-groups';

describe('unit specification groups', () => {
  it('builds complete, public-safe configuration and exact-unit groups', () => {
    const groups = buildUnitSpecificationGroups(detailFixture, productFixture);

    expect(groups.map(({ title }) => title)).toEqual(['Cấu hình', 'Thông tin riêng của máy']);
    expect(groups[0]?.items).toEqual([
      { key: 'releaseYear', label: 'Năm ra mắt', value: '2023' },
      { key: 'chipset', label: 'Chip', value: 'Apple A17 Pro' },
      { key: 'screen', label: 'Màn hình', value: '6.7 inch' },
      { key: 'ram', label: 'RAM', value: '8 GB' },
      { key: 'storage', label: 'Dung lượng', value: '256 GB' },
      { key: 'color', label: 'Màu sắc', value: 'Titan tự nhiên' },
    ]);
    expect(groups[1]?.items).toEqual([
      { key: 'inventoryCode', label: 'Mã máy', value: 'RPH-IP15PM-256-NAT-U01' },
      { key: 'modelNumber', label: 'Mã kiểu máy', value: 'MU663VN/A' },
      { key: 'region', label: 'Thị trường', value: 'VN/A' },
      { key: 'simConfiguration', label: 'Cấu hình SIM', value: 'SIM vật lý và eSIM' },
      {
        detail: 'Nhà mạng: Demo Carrier',
        key: 'networkLock',
        label: 'Khóa mạng',
        value: 'Khóa theo nhà mạng',
      },
      { detail: '207 chu kỳ sạc', key: 'battery', label: 'Pin', value: '96%' },
      { key: 'batteryReplacement', label: 'Linh kiện pin', value: 'Pin nguyên bản' },
      { key: 'grade', label: 'Ngoại hình', value: 'Loại A' },
      {
        key: 'repairHistory',
        label: 'Lịch sử sửa chữa',
        value: 'Không ghi nhận lịch sử sửa chữa',
      },
      { key: 'warranty', label: 'Bảo hành', value: '90 ngày' },
    ]);

    const serialized = JSON.stringify(groups);
    expect(serialized).not.toContain('Ghi chú nội bộ không được lộ');
    expect(serialized).not.toContain('Màn hình đã thay');
    expect(serialized).not.toContain('private-part-id');
  });

  it('omits blank or absent fields without placeholders and preserves partial battery facts', () => {
    const groups = buildUnitSpecificationGroups(
      {
        ...detailFixture,
        unit: {
          ...detailFixture.unit,
          batteryHealthPercent: null,
          carrierName: '  ',
          modelNumber: null,
          regionCode: ' ',
        },
        variant: { ...detailFixture.variant, colorName: ' ', storageCapacityGb: null },
      },
      {
        ...productFixture,
        chipset: ' ',
        ramGb: null,
        releaseYear: null,
        screenSizeInches: null,
      },
    );

    expect(groups[0]?.items).toEqual([]);
    expect(groups[1]?.items.find(({ key }) => key === 'battery')).toEqual({
      key: 'battery',
      label: 'Pin',
      value: '207 chu kỳ sạc',
    });
    expect(groups.flatMap(({ items }) => items).map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(['modelNumber', 'region']),
    );
    expect(JSON.stringify(groups)).not.toContain('—');
  });

  it('renders accessible group headings and contract labels as server markup', () => {
    const markup = renderToStaticMarkup(
      <UnitSpecificationGroups detail={detailFixture} product={productFixture} />,
    );

    expect(markup).toContain('<h2>Thông tin chi tiết</h2>');
    expect(markup).toContain('<h3>Cấu hình</h3>');
    expect(markup).toContain('<h3>Thông tin riêng của máy</h3>');
    expect(markup).toContain('data-specification-key="inventoryCode"');
    expect(markup).toContain('RPH-IP15PM-256-NAT-U01');
    expect(markup).not.toContain('Ghi chú nội bộ không được lộ');
    expect(markup).not.toContain('Màn hình đã thay');
  });
});

const productFixture = {
  brand: 'Apple',
  chipset: 'Apple A17 Pro',
  description: 'Máy cũ đã kiểm định.',
  id: 'product-15-pro-max',
  media: [],
  name: 'iPhone 15 Pro Max',
  productType: 'IPHONE',
  ramGb: 8,
  releaseYear: 2023,
  screenSizeInches: '6.7',
  slug: 'iphone-15-pro-max',
  variants: [],
} satisfies ProductDetail;

const detailFixture = {
  product: {
    brand: 'Apple',
    id: 'product-15-pro-max',
    name: 'iPhone 15 Pro Max',
    slug: 'iphone-15-pro-max',
  },
  unit: {
    batteryCycleCount: 207,
    batteryHealthPercent: 96,
    batteryReplacementStatus: 'ORIGINAL',
    carrierName: 'Demo Carrier',
    conditionGrade: 'A',
    cosmeticNotes: 'Ghi chú nội bộ không được lộ',
    fulfillmentAvailability: { pickup: true, shipping: true },
    functionalChecks: [],
    inventoryCode: 'RPH-IP15PM-256-NAT-U01',
    maskedIdentifiers: [],
    media: [],
    modelNumber: 'MU663VN/A',
    price: { compareAtPrice: '27990000', salePrice: '25490000' },
    regionCode: 'VN/A',
    repairHistoryStatus: 'NONE_KNOWN',
    repairNotes: 'Màn hình đã thay',
    replacedParts: { display: 'private-part-id' },
    simConfiguration: 'PHYSICAL_AND_ESIM',
    simLockStatus: 'CARRIER_LOCKED',
    warrantyDays: 90,
  },
  variant: {
    colorHex: '#b5a99b',
    colorName: 'Titan tự nhiên',
    displayName: '256 GB Titan tự nhiên',
    id: 'variant-natural',
    sku: 'IP15PM-256-NAT',
    storageCapacityGb: 256,
  },
} satisfies UsedIphoneDetail;
