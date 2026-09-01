import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const OPERATIONS_STYLES = [
  './after-sales/after-sales.module.css',
  './warranties/warranties.module.css',
  './warranty-policies/warranty-policies.module.css',
] as const;

describe('operations filter geometry', () => {
  it.each(OPERATIONS_STYLES)(
    'top-aligns fields so help and error copy cannot shift adjacent controls in %s',
    (relativePath) => {
      const stylesheet = readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8',
      );

      expect(stylesheet).toMatch(/\.filters\s*\{[^}]*align-items:\s*start;/);
      expect(stylesheet).toMatch(
        /\.filterActions\s*\{[^}]*padding-block-start:\s*calc\(var\(--line-height-small\) \+ var\(--space-2\)\);/,
      );
    },
  );

  it('keeps audit fields top-aligned when one field shows validation feedback', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('../system/audit/audit.module.css', import.meta.url)),
      'utf8',
    );

    expect(stylesheet).toMatch(/\.filterGrid\s*\{[^}]*align-items:\s*start;/);
    expect(stylesheet).toMatch(
      /\.filterActions\s*\{[^}]*padding-block-start:\s*calc\(var\(--line-height-small\) \+ var\(--space-2\)\);/,
    );
  });
});
