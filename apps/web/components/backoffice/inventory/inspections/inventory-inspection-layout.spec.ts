import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory inspection form geometry', () => {
  it('aligns summary, note and checklist controls from the top', () => {
    const stylesheetPath = fileURLToPath(
      new URL('./inventory-inspection.module.css', import.meta.url),
    );
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain(`.summaryFields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;`);
    expect(stylesheet).toContain(`.notesGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;`);
    expect(stylesheet).toContain(`.checkFields {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(11rem, 0.7fr) minmax(15rem, 1.3fr);
  align-items: start;`);
  });
});
