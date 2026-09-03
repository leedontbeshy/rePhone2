import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('inventory inspection intake handoff', () => {
  it('keeps intake workflow chrome stable while the source is being verified', () => {
    const pagePath = fileURLToPath(new URL('./[id]/page.tsx', import.meta.url));
    const page = readFileSync(pagePath, 'utf8');

    expect(page).toContain("{ status: 'pending' }");
    expect(page).toContain("intakeContext.status === 'pending'");
    expect(page).toContain('showIntakeWorkflow={showIntakeChrome}');
    expect(page).toContain('<InspectionLoadingState showIntakeWorkflow={showIntakeWorkflow} />');
  });

  it('only enables the intake return command after the inspection type is verified', () => {
    const pagePath = fileURLToPath(new URL('./[id]/page.tsx', import.meta.url));
    const page = readFileSync(pagePath, 'utf8');

    expect(page).toContain("setIntakeContext({ status: 'rejected' })");
    expect(page).toContain("status: 'verified'");
    expect(page).toContain('fromIntake={fromIntake}');
  });
});
