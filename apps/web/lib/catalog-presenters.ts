import type { components } from '@rephone/api-client';

type FunctionalCheck = components['schemas']['FunctionalCheckDto'];

const LABELS: Readonly<Record<string, string>> = {
  CARRIER_LOCKED: 'Khóa theo nhà mạng',
  DUAL_PHYSICAL: 'Hai SIM vật lý',
  EID: 'EID',
  ESIM_ONLY: 'Chỉ eSIM',
  FAIL: 'Không đạt',
  IMEI_1: 'IMEI 1',
  IMEI_2: 'IMEI 2',
  KNOWN: 'Có ghi nhận sửa chữa',
  NOT_APPLICABLE: 'Không áp dụng',
  NOT_TESTED: 'Chưa kiểm tra',
  NONE_KNOWN: 'Không ghi nhận lịch sử sửa chữa',
  ORIGINAL: 'Pin nguyên bản',
  PASS: 'Đạt',
  PHYSICAL_AND_ESIM: 'SIM vật lý và eSIM',
  REPLACED: 'Pin đã thay',
  SERIAL: 'Số sê-ri',
  SINGLE_PHYSICAL: 'Một SIM vật lý',
  UNKNOWN: 'Chưa xác định',
  UNLOCKED: 'Không khóa mạng',
  DEGRADED: 'Hoạt động hạn chế',
};

const CHECK_GROUPS = [
  {
    label: 'Hiển thị và camera',
    keys: new Set(['DISPLAY', 'TOUCHSCREEN', 'FRONT_CAMERA', 'REAR_CAMERA', 'FACE_ID_TOUCH_ID']),
  },
  {
    label: 'Âm thanh và điều khiển',
    keys: new Set(['SPEAKER', 'MICROPHONE', 'BUTTONS', 'VIBRATION_HAPTICS']),
  },
  {
    label: 'Kết nối',
    keys: new Set(['WIFI', 'BLUETOOTH', 'CELLULAR', 'GPS_LOCATION', 'CONNECTORS_OTHER']),
  },
  {
    label: 'Nguồn và cảm biến',
    keys: new Set(['CHARGING_PORT', 'WIRELESS_CHARGING', 'BATTERY_FUNCTION', 'SENSORS']),
  },
] as const;

export function catalogLabel(value: string): string {
  return LABELS[value] ?? value.replaceAll('_', ' ').toLocaleLowerCase('vi-VN');
}

export function groupFunctionalChecks(checks: readonly FunctionalCheck[]) {
  const remaining = new Set(checks.map((check) => check.key));
  const groups = CHECK_GROUPS.map((group) => {
    const items = checks.filter((check) => group.keys.has(check.key));
    items.forEach((item) => remaining.delete(item.key));
    return { label: group.label, items };
  }).filter((group) => group.items.length > 0);

  const other = checks.filter((check) => remaining.has(check.key));
  return other.length > 0 ? [...groups, { label: 'Khác', items: other }] : groups;
}

export function countPassingChecks(checks: readonly FunctionalCheck[]): number {
  return checks.filter((check) => check.status === 'PASS').length;
}

export function countAcceptableChecks(checks: readonly FunctionalCheck[]): number {
  return checks.filter((check) => check.status === 'PASS' || check.status === 'NOT_APPLICABLE')
    .length;
}

export function fulfillmentSummary(pickup: boolean, shipping: boolean): string {
  if (pickup && shipping) return 'Nhận tại cửa hàng hoặc giao hàng';
  if (pickup) return 'Nhận tại cửa hàng';
  if (shipping) return 'Có thể giao hàng';
  return 'Tạm thời chưa thể đặt mua';
}
