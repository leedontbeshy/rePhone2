import type { InspectionResult } from '../../generated/prisma/enums.js';

export const FUNCTIONAL_CHECK_STATUSES = [
  'PASS',
  'FAIL',
  'DEGRADED',
  'NOT_TESTED',
  'NOT_APPLICABLE',
  'UNKNOWN',
] as const;

export type FunctionalCheckStatus = (typeof FUNCTIONAL_CHECK_STATUSES)[number];

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

export interface FunctionalCheckItem {
  status: FunctionalCheckStatus;
  note: string | null;
}

export interface InspectionChecklistV1 {
  schemaVersion: 1;
  items: Record<string, FunctionalCheckItem>;
}

export class InspectionChecklistError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = 'InspectionChecklistError';
  }
}

export function validateInspectionChecklist(
  input: unknown,
  complete: boolean,
): InspectionChecklistV1 {
  if (!isRecord(input) || input['schemaVersion'] !== 1 || !isRecord(input['items'])) {
    throw new InspectionChecklistError('INVALID_CHECKLIST_SCHEMA');
  }
  const validKeys = new Set(IPHONE_CHECKLIST_V1.map(([key]) => key));
  const inputKeys = Object.keys(input['items']);
  if (
    inputKeys.some((key) => !validKeys.has(key as (typeof IPHONE_CHECKLIST_V1)[number][0])) ||
    (complete && inputKeys.length !== IPHONE_CHECKLIST_V1.length)
  ) {
    throw new InspectionChecklistError('INVALID_CHECKLIST_KEYS');
  }
  const items: Record<string, FunctionalCheckItem> = {};
  for (const key of inputKeys) {
    const item = input['items'][key];
    if (!isRecord(item) || !isFunctionalCheckStatus(item['status'])) {
      throw new InspectionChecklistError('INVALID_CHECK_STATUS');
    }
    const note = item['note'];
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) {
      throw new InspectionChecklistError('INVALID_CHECK_NOTE');
    }
    const normalizedNote = typeof note === 'string' ? note.trim() : null;
    if (['FAIL', 'DEGRADED', 'NOT_TESTED', 'UNKNOWN'].includes(item['status']) && !normalizedNote) {
      throw new InspectionChecklistError('CHECK_NOTE_REQUIRED');
    }
    items[key] = { status: item['status'], note: normalizedNote };
  }
  return { schemaVersion: 1, items };
}

export function inspectionResult(checklist: InspectionChecklistV1): InspectionResult {
  const statuses = Object.values(checklist.items).map((item) => item.status);
  if (statuses.includes('FAIL')) return 'FAILED';
  if (statuses.some((status) => ['DEGRADED', 'NOT_TESTED', 'UNKNOWN'].includes(status))) {
    return 'PARTIAL';
  }
  return 'PASSED';
}

export function isFunctionalCheckStatus(value: unknown): value is FunctionalCheckStatus {
  return (
    typeof value === 'string' && (FUNCTIONAL_CHECK_STATUSES as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
