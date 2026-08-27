import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import { catalogLabel } from '@/lib/catalog-presenters';

export type UnitSpecificationKey =
  | 'battery'
  | 'batteryReplacement'
  | 'chipset'
  | 'color'
  | 'grade'
  | 'inventoryCode'
  | 'modelNumber'
  | 'networkLock'
  | 'ram'
  | 'region'
  | 'releaseYear'
  | 'repairHistory'
  | 'screen'
  | 'simConfiguration'
  | 'storage'
  | 'warranty';

export interface UnitSpecificationItem {
  readonly detail?: string;
  readonly key: UnitSpecificationKey;
  readonly label: string;
  readonly value: string;
}

export interface UnitSpecificationGroup {
  readonly items: readonly UnitSpecificationItem[];
  readonly key: 'configuration' | 'unit';
  readonly title: 'Cấu hình' | 'Thông tin riêng của máy';
}

export function buildUnitSpecificationGroups(
  detail: UsedIphoneDetail,
  product: ProductDetail,
): readonly UnitSpecificationGroup[] {
  const { unit, variant } = detail;
  const configuration = compactItems([
    specification('releaseYear', 'Năm ra mắt', formatNumber(product.releaseYear)),
    specification('chipset', 'Chip', cleanText(product.chipset)),
    specification('screen', 'Màn hình', suffixText(product.screenSizeInches, ' inch')),
    specification('ram', 'RAM', suffixNumber(product.ramGb, ' GB')),
    specification('storage', 'Dung lượng', suffixNumber(variant.storageCapacityGb, ' GB')),
    specification('color', 'Màu sắc', cleanText(variant.colorName)),
  ]);

  const battery = batterySpecification(unit.batteryHealthPercent, unit.batteryCycleCount);
  const networkCarrier =
    unit.simLockStatus === 'CARRIER_LOCKED' ? cleanText(unit.carrierName) : undefined;
  const unitFacts = compactItems([
    specification('inventoryCode', 'Mã máy', cleanText(unit.inventoryCode)),
    specification('modelNumber', 'Mã model', cleanText(unit.modelNumber)),
    specification('region', 'Thị trường', cleanText(unit.regionCode)),
    specification('simConfiguration', 'Cấu hình SIM', catalogLabel(unit.simConfiguration)),
    specification(
      'networkLock',
      'Khóa mạng',
      catalogLabel(unit.simLockStatus),
      networkCarrier === undefined ? undefined : `Nhà mạng: ${networkCarrier}`,
    ),
    battery,
    specification(
      'batteryReplacement',
      'Linh kiện pin',
      catalogLabel(unit.batteryReplacementStatus),
    ),
    specification('grade', 'Ngoại hình', `Grade ${unit.conditionGrade}`),
    specification('repairHistory', 'Lịch sử sửa chữa', catalogLabel(unit.repairHistoryStatus)),
    specification('warranty', 'Bảo hành', `${String(unit.warrantyDays)} ngày`),
  ]);

  return [
    { items: configuration, key: 'configuration', title: 'Cấu hình' },
    { items: unitFacts, key: 'unit', title: 'Thông tin riêng của máy' },
  ];
}

function batterySpecification(
  healthPercent?: number | null,
  cycleCount?: number | null,
): UnitSpecificationItem | null {
  const health = suffixNumber(healthPercent, '%');
  const cycles = suffixNumber(cycleCount, ' chu kỳ sạc');
  if (health === undefined && cycles === undefined) return null;
  if (health === undefined) return specification('battery', 'Pin', cycles);
  return specification('battery', 'Pin', health, cycles);
}

function specification(
  key: UnitSpecificationKey,
  label: string,
  value?: string,
  detail?: string,
): UnitSpecificationItem | null {
  const normalizedValue = cleanText(value);
  if (normalizedValue === undefined) return null;
  const normalizedDetail = cleanText(detail);
  return {
    ...(normalizedDetail === undefined ? {} : { detail: normalizedDetail }),
    key,
    label,
    value: normalizedValue,
  };
}

function compactItems(
  items: readonly (UnitSpecificationItem | null)[],
): readonly UnitSpecificationItem[] {
  return items.filter((item): item is UnitSpecificationItem => item !== null);
}

function cleanText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function formatNumber(value?: number | null): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function suffixNumber(value: number | null | undefined, suffix: string): string | undefined {
  const formatted = formatNumber(value);
  return formatted === undefined ? undefined : `${formatted}${suffix}`;
}

function suffixText(value: string | null | undefined, suffix: string): string | undefined {
  const formatted = cleanText(value);
  return formatted === undefined ? undefined : `${formatted}${suffix}`;
}
