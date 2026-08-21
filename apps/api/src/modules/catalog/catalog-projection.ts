import type { FunctionalCheckDto, MaskedIdentifierDto } from './catalog-response.dto.js';
import {
  IPHONE_CHECKLIST_V1,
  isFunctionalCheckStatus,
} from '../../common/domain/iphone-inspection-checklist.js';

export { IPHONE_CHECKLIST_V1 } from '../../common/domain/iphone-inspection-checklist.js';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
