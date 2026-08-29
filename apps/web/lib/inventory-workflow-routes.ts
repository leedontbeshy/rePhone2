export function intakeInspectionHref(inspectionId: string): string {
  return `/backoffice/inventory/inspections/${encodeURIComponent(inspectionId)}?source=intake`;
}

export function intakeResumeHref(unitId: string, inspectionId: string): string {
  const query = new URLSearchParams({ unitId, inspectionId });
  return `/backoffice/inventory/intake?${query.toString()}`;
}

export function isVerifiedIntakeInspectionSource(
  source: string | null,
  inspectionType: string,
): boolean {
  return source === 'intake' && inspectionType === 'INTAKE';
}
