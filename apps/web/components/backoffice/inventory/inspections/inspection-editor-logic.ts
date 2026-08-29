import type {
  InventoryCheckStatus,
  InventoryInspectionDetail,
  InventoryInspectionResult,
  InventoryInspectionChecksInput,
  UpdateInventoryInspectionInput,
} from '@/lib/backoffice-inventory-api';

export type InventoryInspectionCheckKey =
  | 'DISPLAY'
  | 'TOUCHSCREEN'
  | 'FRONT_CAMERA'
  | 'REAR_CAMERA'
  | 'FACE_ID_TOUCH_ID'
  | 'SPEAKER'
  | 'MICROPHONE'
  | 'BUTTONS'
  | 'VIBRATION_HAPTICS'
  | 'WIFI'
  | 'BLUETOOTH'
  | 'CELLULAR'
  | 'CHARGING_PORT'
  | 'WIRELESS_CHARGING'
  | 'BATTERY_FUNCTION'
  | 'GPS_LOCATION'
  | 'SENSORS'
  | 'CONNECTORS_OTHER';

export interface InspectionCheckDefinition {
  readonly key: InventoryInspectionCheckKey;
  readonly label: string;
  readonly description: string;
}

export interface InspectionCheckGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly items: readonly InspectionCheckDefinition[];
}

export const INSPECTION_CHECK_GROUPS: readonly InspectionCheckGroup[] = [
  {
    id: 'display-camera',
    label: 'Hiển thị và camera',
    description: 'Kiểm tra khả năng hiển thị, cảm ứng, camera và nhận diện sinh trắc học.',
    items: [
      {
        key: 'DISPLAY',
        label: 'Màn hình hiển thị',
        description: 'Điểm chết, ám màu, độ sáng và khả năng hiển thị.',
      },
      {
        key: 'TOUCHSCREEN',
        label: 'Cảm ứng',
        description: 'Toàn vùng cảm ứng và thao tác nhiều điểm.',
      },
      {
        key: 'FRONT_CAMERA',
        label: 'Camera trước',
        description: 'Khả năng chụp, quay và lấy nét.',
      },
      {
        key: 'REAR_CAMERA',
        label: 'Camera sau',
        description: 'Tất cả ống kính, chụp, quay và lấy nét.',
      },
      {
        key: 'FACE_ID_TOUCH_ID',
        label: 'Face ID hoặc Touch ID',
        description: 'Khả năng nhận diện sinh trắc học theo dòng máy.',
      },
    ],
  },
  {
    id: 'sound-controls',
    label: 'Âm thanh và phím bấm',
    description: 'Kiểm tra nghe gọi, thu âm, rung và các phím vật lý.',
    items: [
      {
        key: 'SPEAKER',
        label: 'Loa',
        description: 'Loa thoại và loa ngoài.',
      },
      {
        key: 'MICROPHONE',
        label: 'Micro',
        description: 'Thu âm và chất lượng thoại.',
      },
      {
        key: 'BUTTONS',
        label: 'Phím vật lý',
        description: 'Nguồn, âm lượng, phím tác vụ hoặc gạt chuông.',
      },
      {
        key: 'VIBRATION_HAPTICS',
        label: 'Rung và phản hồi',
        description: 'Motor rung và phản hồi khi thao tác.',
      },
    ],
  },
  {
    id: 'connections',
    label: 'Kết nối',
    description: 'Kiểm tra kết nối không dây, mạng di động, cổng sạc và phụ kiện.',
    items: [
      {
        key: 'WIFI',
        label: 'Wi-Fi',
        description: 'Kết nối và duy trì tín hiệu.',
      },
      {
        key: 'BLUETOOTH',
        label: 'Bluetooth',
        description: 'Bật, dò tìm và kết nối thiết bị.',
      },
      {
        key: 'CELLULAR',
        label: 'Sóng di động',
        description: 'Nhận SIM hoặc eSIM, nghe gọi và dữ liệu cơ bản.',
      },
      {
        key: 'CHARGING_PORT',
        label: 'Cổng sạc',
        description: 'Nhận sạc, cáp và duy trì kết nối ổn định.',
      },
      {
        key: 'WIRELESS_CHARGING',
        label: 'Sạc không dây',
        description: 'Chọn “Không áp dụng” nếu dòng máy không hỗ trợ.',
      },
    ],
  },
  {
    id: 'battery-sensors',
    label: 'Pin, cảm biến và kết nối khác',
    description: 'Kiểm tra vận hành pin, định vị, cảm biến và kết nối còn lại.',
    items: [
      {
        key: 'BATTERY_FUNCTION',
        label: 'Hoạt động pin',
        description: 'Nhận pin, sạc, xả và cảnh báo linh kiện.',
      },
      {
        key: 'GPS_LOCATION',
        label: 'GPS và định vị',
        description: 'Khả năng nhận vị trí cơ bản.',
      },
      {
        key: 'SENSORS',
        label: 'Cảm biến',
        description: 'Tiệm cận, xoay, ánh sáng và cảm biến cơ bản.',
      },
      {
        key: 'CONNECTORS_OTHER',
        label: 'Kết nối khác',
        description: 'NFC, phụ kiện USB và kết nối liên quan.',
      },
    ],
  },
];

export const INSPECTION_CHECKS = INSPECTION_CHECK_GROUPS.flatMap((group) => group.items);

export interface InspectionCheckDraft {
  readonly note: string;
  readonly status: InventoryCheckStatus | '';
}

export interface InspectionEditorDraft {
  readonly batteryCycleCount: string;
  readonly batteryHealthPercent: string;
  readonly batteryReplacementStatus: 'ORIGINAL' | 'REPLACED' | 'UNKNOWN';
  readonly checks: Record<InventoryInspectionCheckKey, InspectionCheckDraft>;
  readonly conditionGrade: '' | 'A' | 'B' | 'C';
  readonly cosmeticNotes: string;
  readonly repairHistoryStatus: 'NONE_KNOWN' | 'KNOWN' | 'UNKNOWN';
  readonly repairNotes: string;
}

export type InspectionEditorFieldErrors = Readonly<Record<string, string>>;

export interface InspectionDraftValidation {
  readonly errors: InspectionEditorFieldErrors;
  readonly input: UpdateInventoryInspectionInput;
  readonly isValid: boolean;
}

export function inspectionDraftFrom(inspection: InventoryInspectionDetail): InspectionEditorDraft {
  const projectedItems = new Map(
    (inspection.checklist?.items ?? []).map((item) => [item.key, item] as const),
  );
  const storedItems = inspection.checks?.items ?? {};
  const checks = Object.fromEntries(
    INSPECTION_CHECKS.map((definition) => {
      const stored = storedItems[definition.key];
      const projected = projectedItems.get(definition.key);
      return [
        definition.key,
        {
          status: stored?.status ?? projected?.status ?? '',
          note: stored?.note ?? projected?.note ?? '',
        } satisfies InspectionCheckDraft,
      ];
    }),
  ) as Record<InventoryInspectionCheckKey, InspectionCheckDraft>;

  return {
    batteryCycleCount: optionalNumber(inspection.batteryCycleCount),
    batteryHealthPercent: optionalNumber(inspection.batteryHealthPercent),
    batteryReplacementStatus: inspection.batteryReplacementStatus,
    checks,
    conditionGrade: inspection.conditionGrade ?? '',
    cosmeticNotes: inspection.cosmeticNotes ?? '',
    repairHistoryStatus: inspection.repairHistoryStatus,
    repairNotes: inspection.repairNotes ?? '',
  };
}

export function validateInspectionDraft(
  draft: InspectionEditorDraft,
  mode: 'save' | 'complete',
): InspectionDraftValidation {
  const errors: Record<string, string> = {};
  const items: InventoryInspectionChecksInput['items'] = {};

  for (const check of INSPECTION_CHECKS) {
    const value = draft.checks[check.key];
    if (value.status === '') {
      if (mode === 'complete') errors[`checks.${check.key}.status`] = 'Hãy chọn kết quả.';
      continue;
    }
    const note = value.note.trim();
    if (inspectionCheckRequiresNote(value.status) && note === '') {
      errors[`checks.${check.key}.note`] = 'Cần ghi rõ tình trạng hoặc lý do.';
    } else if (note.length > 500) {
      errors[`checks.${check.key}.note`] = 'Ghi chú không được vượt quá 500 ký tự.';
    }
    items[check.key] = { status: value.status, note: note === '' ? null : note };
  }

  const batteryHealthPercent = optionalInteger(
    draft.batteryHealthPercent,
    'batteryHealthPercent',
    errors,
    0,
    100,
  );
  const batteryCycleCount = optionalInteger(
    draft.batteryCycleCount,
    'batteryCycleCount',
    errors,
    0,
  );
  if (mode === 'complete' && batteryHealthPercent === undefined) {
    errors['batteryHealthPercent'] ??= 'Hãy nhập tình trạng pin.';
  }
  if (mode === 'complete' && draft.conditionGrade === '') {
    errors['conditionGrade'] = 'Hãy xếp loại ngoại hình.';
  }
  if (draft.cosmeticNotes.trim().length > 2_000) {
    errors['cosmeticNotes'] = 'Ghi chú ngoại hình không được vượt quá 2.000 ký tự.';
  }
  if (draft.repairNotes.trim().length > 2_000) {
    errors['repairNotes'] = 'Ghi chú sửa chữa không được vượt quá 2.000 ký tự.';
  }
  if (
    mode === 'complete' &&
    draft.repairHistoryStatus === 'KNOWN' &&
    draft.repairNotes.trim() === ''
  ) {
    errors['repairNotes'] = 'Hãy ghi rõ lịch sử sửa chữa đã biết.';
  }

  const input: UpdateInventoryInspectionInput = {
    batteryReplacementStatus: draft.batteryReplacementStatus,
    checks: { schemaVersion: 1, items },
    cosmeticNotes: draft.cosmeticNotes.trim() || null,
    repairNotes: draft.repairHistoryStatus === 'KNOWN' ? draft.repairNotes.trim() || null : null,
    repairHistoryStatus: draft.repairHistoryStatus,
    ...(batteryHealthPercent === undefined ? {} : { batteryHealthPercent }),
    ...(batteryCycleCount === undefined ? {} : { batteryCycleCount }),
    ...(draft.conditionGrade === '' ? {} : { conditionGrade: draft.conditionGrade }),
  };

  return { errors, input, isValid: Object.keys(errors).length === 0 };
}

export function inspectionCheckRequiresNote(status: InventoryCheckStatus): boolean {
  return (
    status === 'FAIL' || status === 'DEGRADED' || status === 'NOT_TESTED' || status === 'UNKNOWN'
  );
}

export function inspectionDraftProgress(draft: InspectionEditorDraft): {
  readonly completed: number;
  readonly total: number;
} {
  return {
    completed: INSPECTION_CHECKS.filter((check) => draft.checks[check.key].status !== '').length,
    total: INSPECTION_CHECKS.length,
  };
}

export function inspectionDraftResult(draft: InspectionEditorDraft): InventoryInspectionResult {
  const statuses = INSPECTION_CHECKS.map((check) => draft.checks[check.key].status);
  if (statuses.includes('')) return 'INCOMPLETE';
  if (statuses.includes('FAIL')) return 'FAILED';
  if (
    statuses.some(
      (status) => status === 'DEGRADED' || status === 'NOT_TESTED' || status === 'UNKNOWN',
    )
  ) {
    return 'PARTIAL';
  }
  return 'PASSED';
}

function optionalNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function optionalInteger(
  value: string,
  field: string,
  errors: Record<string, string>,
  minimum: number,
  maximum?: number,
): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (!/^\d+$/.test(trimmed)) {
    errors[field] = 'Chỉ nhập số nguyên không âm.';
    return undefined;
  }
  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
    errors[field] =
      maximum === undefined
        ? `Giá trị phải từ ${String(minimum)} trở lên.`
        : `Giá trị phải từ ${String(minimum)} đến ${String(maximum)}.`;
    return undefined;
  }
  return parsed;
}
