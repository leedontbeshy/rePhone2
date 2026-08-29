export type IntakeStep = 1 | 2 | 3 | 4 | 5;

export interface IntakeProgressState {
  readonly hasUnit: boolean;
  readonly hasMedia: boolean;
  readonly inspectionPassed: boolean;
  readonly isAvailable: boolean;
}

export function resolveIntakeStep({
  hasUnit,
  hasMedia,
  inspectionPassed,
  isAvailable,
}: IntakeProgressState): IntakeStep {
  if (!hasUnit) return 1;
  if (!hasMedia) return 2;
  if (!inspectionPassed) return 3;
  if (!isAvailable) return 4;
  return 5;
}
