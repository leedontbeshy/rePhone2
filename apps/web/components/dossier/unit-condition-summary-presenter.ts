import type { UsedIphoneDetail } from '@/lib/catalog-api';

export type UnitConditionSource = Readonly<
  Pick<
    UsedIphoneDetail['unit'],
    | 'batteryCycleCount'
    | 'batteryHealthPercent'
    | 'batteryReplacementStatus'
    | 'conditionGrade'
    | 'cosmeticNotes'
    | 'repairHistoryStatus'
  >
>;

export type UnitConditionKey = 'appearance' | 'battery' | 'repair-history';

export interface UnitConditionRow {
  readonly detail?: string;
  readonly key: UnitConditionKey;
  readonly label: string;
  readonly value: string;
}

export interface UnitConditionSummaryViewModel {
  readonly rows: readonly UnitConditionRow[];
}

const BATTERY_REPLACEMENT_LABELS: Readonly<
  Record<UnitConditionSource['batteryReplacementStatus'], string>
> = {
  ORIGINAL: 'Pin nguyên bản',
  REPLACED: 'Pin đã thay',
  UNKNOWN: 'Chưa xác định tình trạng linh kiện pin',
};

const REPAIR_HISTORY_LABELS: Readonly<Record<UnitConditionSource['repairHistoryStatus'], string>> =
  {
    KNOWN: 'Có ghi nhận sửa chữa',
    NONE_KNOWN: 'Chưa ghi nhận sửa chữa',
    UNKNOWN: 'Chưa đủ thông tin',
  };

export function buildUnitConditionSummary(
  unit: UnitConditionSource,
): UnitConditionSummaryViewModel {
  const cosmeticNotes = normalizedOptionalText(unit.cosmeticNotes);
  const batteryMetrics = [
    unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined
      ? null
      : `${String(unit.batteryHealthPercent)}%`,
    unit.batteryCycleCount === null || unit.batteryCycleCount === undefined
      ? null
      : `${String(unit.batteryCycleCount)} chu kỳ`,
  ].filter((metric): metric is string => metric !== null);
  const batteryReplacementLabel = BATTERY_REPLACEMENT_LABELS[unit.batteryReplacementStatus];

  return {
    rows: [
      {
        ...(cosmeticNotes === undefined ? {} : { detail: cosmeticNotes }),
        key: 'appearance',
        label: 'Ngoại hình',
        value: `Grade ${unit.conditionGrade}`,
      },
      {
        ...(batteryMetrics.length === 0 ? {} : { detail: batteryReplacementLabel }),
        key: 'battery',
        label: 'Pin',
        value: batteryMetrics.length === 0 ? batteryReplacementLabel : batteryMetrics.join(' · '),
      },
      {
        key: 'repair-history',
        label: 'Lịch sử sửa chữa',
        value: REPAIR_HISTORY_LABELS[unit.repairHistoryStatus],
      },
    ],
  };
}

function normalizedOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}
