import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory intake form layout', () => {
  it('groups the workbench and keeps paired controls aligned from the top', () => {
    const stylesheetPath = fileURLToPath(new URL('./intake.module.css', import.meta.url));
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain(`.intakeWorkbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(17rem, 20rem);`);
    expect(stylesheet).toContain(`.sectionFields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
  padding: var(--space-5);
}`);
    expect(stylesheet).toContain(`.sectionFields > div > label {
  display: inline-flex;
  align-items: baseline;
  gap: 0;
}`);
  });

  it('renders only the workflow stage selected by the progress bar', () => {
    const wizardPath = fileURLToPath(new URL('./wizard.tsx', import.meta.url));
    const wizard = readFileSync(wizardPath, 'utf8');

    for (const step of [2, 3, 4, 5]) {
      expect(wizard).toMatch(
        new RegExp(`\\{activeStep === ${String(step)} \\? \\(\\s*<WorkflowStage`),
      );
    }
  });

  it('keeps resume loading separate from step one and uses an intake inspection route', () => {
    const wizardPath = fileURLToPath(new URL('./wizard.tsx', import.meta.url));
    const wizard = readFileSync(wizardPath, 'utf8');

    expect(wizard).toContain('const hasRequestedExistingUnit =');
    expect(wizard).toContain('inspection?.id !== inspectionId');
    expect(wizard).toContain('<ExistingUnitLoadingState failed={error !== null} />');
    expect(wizard).toContain('router.push(intakeInspectionHref(result.data.data.id));');
  });

  it('balances all five summary facts and replaces the native file control visually', () => {
    const stylesheetPath = fileURLToPath(new URL('./intake.module.css', import.meta.url));
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));');
    expect(stylesheet).toContain('.unitSummary > div:nth-child(n + 4)');
    expect(stylesheet).toContain('.fileInput:focus-visible + .filePicker');
    expect(stylesheet).toContain('clip-path: inset(50%);');

    const wizardPath = fileURLToPath(new URL('./wizard.tsx', import.meta.url));
    const wizard = readFileSync(wizardPath, 'utf8');
    expect(wizard).toContain('ref={fileInputRef}');
    expect(wizard).toContain("disabled={busy === 'upload'}");
    expect(wizard).toContain("identifiers || 'Chưa có mã định danh'");
    expect(wizard).not.toContain("key={file?.name ?? 'empty'}");
  });

  it('creates a fresh inspection directly and offers a retry only after a non-pass result', () => {
    const wizardPath = fileURLToPath(new URL('./wizard.tsx', import.meta.url));
    const wizard = readFileSync(wizardPath, 'utf8');

    expect(wizard).toContain('router.push(intakeInspectionHref(result.data.data.id));');
    expect(wizard).toContain("inspection.overallResult === 'PASSED' ? null : (");
    expect(wizard).toContain('Tạo phiếu kiểm định lại');
  });
});
