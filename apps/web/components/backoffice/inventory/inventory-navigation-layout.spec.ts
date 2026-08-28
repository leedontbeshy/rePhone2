import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('FE-06 inventory navigation layout', () => {
  it('centers the workspace navigation on desktop while preserving mobile overflow', () => {
    const stylesheetPath = fileURLToPath(new URL('./inventory.module.css', import.meta.url));
    const stylesheet = readFileSync(stylesheetPath, 'utf8');

    expect(stylesheet).toContain(`@media (min-width: 48rem) {
  .workspaceNavigation ul {
    justify-content: center;
  }
}`);
    expect(stylesheet).toContain('overflow-x: auto;');
    expect(stylesheet).toContain('width: max-content;');
    expect(stylesheet).toContain('white-space: nowrap;');
  });
});
