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
});
