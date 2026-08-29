import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory lookup form layout', () => {
  it('keeps paired identifier fields aligned from the top when validation feedback appears', () => {
    const stylesheetPath = fileURLToPath(new URL('./inventory-lookup.module.css', import.meta.url));
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain(`.fieldGrid {
  align-items: start;
`);
  });
});
