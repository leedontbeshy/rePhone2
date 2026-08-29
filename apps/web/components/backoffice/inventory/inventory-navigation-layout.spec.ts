import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('FE-06 inventory navigation layout', () => {
  it('uses the main desktop sidebar instead of a second horizontal navigation bar', () => {
    const inventoryStylesheetPath = fileURLToPath(
      new URL('./inventory.module.css', import.meta.url),
    );
    const shellStylesheetPath = fileURLToPath(
      new URL('../../shells/shells.module.css', import.meta.url),
    );
    const inventoryStylesheet = readFileSync(inventoryStylesheetPath, 'utf8');
    const shellStylesheet = readFileSync(shellStylesheetPath, 'utf8');

    expect(inventoryStylesheet).not.toContain('.workspaceNavigation');
    expect(shellStylesheet).toContain('.backofficeSidebarWithLabels .navigationGroupLabel');
    expect(shellStylesheet).toContain('text-transform: uppercase;');
  });
});
