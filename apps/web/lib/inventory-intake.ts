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

export const CHECK_STATUSES = [
  'PASS',
  'FAIL',
  'DEGRADED',
  'NOT_TESTED',
  'NOT_APPLICABLE',
  'UNKNOWN',
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];

export interface CheckDraft {
  note: string;
  status: CheckStatus;
}

export type ChecklistDraft = Record<(typeof IPHONE_CHECKLIST_V1)[number][0], CheckDraft>;

export function allPassChecklist(): ChecklistDraft {
  return Object.fromEntries(
    IPHONE_CHECKLIST_V1.map(([key]) => [key, { note: '', status: 'PASS' }]),
  ) as ChecklistDraft;
}

export function checklistPayload(draft: ChecklistDraft) {
  return {
    schemaVersion: 1,
    items: Object.fromEntries(
      IPHONE_CHECKLIST_V1.map(([key]) => [
        key,
        { note: draft[key].note.trim() || null, status: draft[key].status },
      ]),
    ),
  };
}

export function checklistFromApi(value: unknown): ChecklistDraft {
  const fallback = allPassChecklist();
  if (!isRecord(value) || !isRecord(value['items'])) return fallback;
  const items = value['items'];
  for (const [key] of IPHONE_CHECKLIST_V1) {
    const item = items[key];
    if (!isRecord(item) || !isCheckStatus(item['status'])) continue;
    fallback[key] = {
      status: item['status'],
      note: typeof item['note'] === 'string' ? item['note'] : '',
    };
  }
  return fallback;
}

function isCheckStatus(value: unknown): value is CheckStatus {
  return typeof value === 'string' && (CHECK_STATUSES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
