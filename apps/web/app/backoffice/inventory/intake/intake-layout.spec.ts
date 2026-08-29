import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory intake form layout', () => {
  it('keeps required markers inline and aligns paired controls from the top', () => {
    const stylesheetPath = fileURLToPath(new URL('./intake.module.css', import.meta.url));
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain(`.workspace :global(.wizard-form) {
  align-items: start;
}`);
    expect(stylesheet).toContain(`.workspace :global(.wizard-form > div > label) {
  display: inline-flex;
  align-items: baseline;
  gap: 0;
}`);
  });
});
