import { describe, expect, it } from 'vitest';
import {
  IPHONE_CHECKLIST_V1,
  projectFunctionalChecks,
  projectMaskedIdentifiers,
} from './catalog-projection.js';

describe('public catalog projection', () => {
  it('projects the version-one checklist in registry order', () => {
    const items = Object.fromEntries(
      [...IPHONE_CHECKLIST_V1].reverse().map(([key]) => [key, { status: 'PASS', note: null }]),
    );

    const result = projectFunctionalChecks({ schemaVersion: 1, items });

    expect(result?.map(({ key }) => key)).toEqual(IPHONE_CHECKLIST_V1.map(([key]) => key));
    expect(result?.[0]).toEqual({
      key: 'DISPLAY',
      label: 'Màn hình hiển thị',
      status: 'PASS',
      note: null,
    });
  });

  it('fails closed for an unknown or incomplete checklist', () => {
    expect(projectFunctionalChecks({ schemaVersion: 2, items: {} })).toBeNull();
    expect(
      projectFunctionalChecks({ schemaVersion: 1, items: { DISPLAY: { status: 'PASS' } } }),
    ).toBeNull();
  });

  it('only exposes four-character identifier suffixes', () => {
    expect(
      projectMaskedIdentifiers({
        imei1Suffix: '1234',
        imei2Suffix: null,
        serialSuffix: 'ABCD',
        eidSuffix: 'too-long',
      }),
    ).toEqual([
      { type: 'IMEI_1', maskedValue: '•••• 1234' },
      { type: 'SERIAL', maskedValue: '•••• ABCD' },
    ]);
  });
});
