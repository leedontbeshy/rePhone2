import type {
  FunctionalCheckDto,
  FunctionalCheckStatus,
  MaskedIdentifierDto,
} from './catalog-response.dto.js';

const CHECK_STATUSES = new Set<FunctionalCheckStatus>([
  'PASS',
  'FAIL',
  'DEGRADED',
  'NOT_TESTED',
  'NOT_APPLICABLE',
  'UNKNOWN',
]);

export const IPHONE_CHECKLIST_V1 = [
  ['DISPLAY', 'Màn hình hiển thị'],
  ['TOUCHSCREEN', 'Cảm ứng'],
  ['FRONT_CAMERA', 'Camera trước'],
  ['REAR_CAMERA', 'Camera sau'],
  ['FACE_ID_TOUCH_ID', 'Face ID/Touch ID'],
  ['SPEAKER', 'Loa'],
  ['MICROPHONE', 'Micro'],
  ['BUTTONS', 'Phím vật lý'],
  ['VIBRATION_HAPTICS', 'Rung/Haptic'],
  ['WIFI', 'Wi-Fi'],
  ['BLUETOOTH', 'Bluetooth'],
  ['CELLULAR', 'Sóng di động'],
  ['CHARGING_PORT', 'Cổng sạc'],
  ['WIRELESS_CHARGING', 'Sạc không dây'],
  ['BATTERY_FUNCTION', 'Hoạt động pin'],
  ['GPS_LOCATION', 'GPS/Định vị'],
  ['SENSORS', 'Cảm biến'],
  ['CONNECTORS_OTHER', 'Kết nối khác'],
] as const;

interface ChecklistItemInput {
  status?: unknown;
  note?: unknown;
}

export function projectFunctionalChecks(checks: unknown): FunctionalCheckDto[] | null {
  if (!isRecord(checks) || checks['schemaVersion'] !== 1 || !isRecord(checks['items'])) {
    return null;
  }
  const items = checks['items'];
  if (
    Object.keys(items).length !== IPHONE_CHECKLIST_V1.length ||
    IPHONE_CHECKLIST_V1.some(([key]) => !(key in items))
  ) {
    return null;
  }

  const projection: FunctionalCheckDto[] = [];
  for (const [key, label] of IPHONE_CHECKLIST_V1) {
    const rawItem = items[key] as ChecklistItemInput | undefined;
    if (!isRecord(rawItem) || !isFunctionalCheckStatus(rawItem.status)) {
      return null;
    }
    if (rawItem.note !== null && rawItem.note !== undefined && typeof rawItem.note !== 'string') {
      return null;
    }
    projection.push({
      key,
      label,
      status: rawItem.status,
      ...(rawItem.note === undefined ? {} : { note: rawItem.note }),
    });
  }
  return projection;
}

export function projectMaskedIdentifiers(input: {
  imei1Suffix: string | null;
  imei2Suffix: string | null;
  serialSuffix: string | null;
  eidSuffix: string | null;
}): MaskedIdentifierDto[] {
  return [
    maskedIdentifier('IMEI_1', input.imei1Suffix),
    maskedIdentifier('IMEI_2', input.imei2Suffix),
    maskedIdentifier('SERIAL', input.serialSuffix),
    maskedIdentifier('EID', input.eidSuffix),
  ].filter((value): value is MaskedIdentifierDto => value !== null);
}

function maskedIdentifier(
  type: MaskedIdentifierDto['type'],
  suffix: string | null,
): MaskedIdentifierDto | null {
  if (suffix === null || !/^[A-Za-z0-9]{4}$/.test(suffix)) {
    return null;
  }
  return { type, maskedValue: `•••• ${suffix}` };
}

function isFunctionalCheckStatus(value: unknown): value is FunctionalCheckStatus {
  return typeof value === 'string' && CHECK_STATUSES.has(value as FunctionalCheckStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
