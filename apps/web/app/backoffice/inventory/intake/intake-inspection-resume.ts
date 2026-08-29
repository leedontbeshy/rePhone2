interface IntakeInspectionResumeCandidate {
  readonly id: string;
  readonly inspectionType: 'INTAKE' | 'RETURN' | 'WARRANTY' | 'PRE_SALE';
  readonly status: 'DRAFT' | 'COMPLETED';
}

export interface IntakeInspectionResumeResolution {
  readonly requestedInspectionWasIgnored: boolean;
  readonly resumeId: string | undefined;
}

export function resolveIntakeInspectionResume({
  currentInspectionId,
  inspections,
  requestedInspectionId,
}: Readonly<{
  currentInspectionId: string | undefined;
  inspections: readonly IntakeInspectionResumeCandidate[];
  requestedInspectionId: string | null;
}>): IntakeInspectionResumeResolution {
  const intakeInspections = inspections.filter((item) => item.inspectionType === 'INTAKE');
  const requestedCandidate =
    requestedInspectionId === null
      ? undefined
      : intakeInspections.find((item) => item.id === requestedInspectionId);
  const requestedInspection =
    requestedCandidate?.status === 'DRAFT' || requestedCandidate?.id === currentInspectionId
      ? requestedCandidate
      : undefined;

  return {
    requestedInspectionWasIgnored:
      requestedInspectionId !== null && requestedInspection === undefined,
    resumeId:
      requestedInspection?.id ??
      intakeInspections.find((item) => item.status === 'DRAFT')?.id ??
      intakeInspections.find((item) => item.id === currentInspectionId)?.id,
  };
}
