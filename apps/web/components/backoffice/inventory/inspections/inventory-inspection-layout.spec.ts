import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory inspection form geometry', () => {
  it('aligns summary, note and checklist controls from the top', () => {
    const stylesheetPath = fileURLToPath(
      new URL('./inventory-inspection.module.css', import.meta.url),
    );
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    for (const selector of ['summaryFields', 'notesGrid', 'checkFields']) {
      expect(stylesheet).toMatch(
        new RegExp(String.raw`\.${selector}\s*\{[^}]*align-items:\s*start;`),
      );
    }
    expect(stylesheet).toMatch(/\.checkFields\s*\{[^}]*min-width:\s*0;/);
    expect(stylesheet).toMatch(/@container inventory-inspection \(max-width: 41\.999rem\)/);
  });
});
