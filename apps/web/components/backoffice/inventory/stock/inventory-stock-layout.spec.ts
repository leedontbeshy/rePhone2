import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory stock layout contracts', () => {
  it('top-aligns movement filters when the reference field has supporting copy', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('./inventory-stock.module.css', import.meta.url)),
      'utf8',
    );

    expect(stylesheet).toMatch(/\.movementFilters\s*\{[^}]*align-items:\s*start;/);
  });

  it('keeps enough vertical padding for select-option descenders', () => {
    const primitives = readFileSync(
      fileURLToPath(new URL('../../../ui/primitives.module.css', import.meta.url)),
      'utf8',
    );

    expect(primitives).toMatch(/select\.control\s*\{[^}]*padding-block:\s*var\(--space-2\);/);
  });
});
