import { describe, expect, it } from 'vitest';
import { createAfterSalesEvidenceOpenGate } from './after-sales-evidence';

describe('after-sales evidence open gate', () => {
  it('allows only one evidence request until the matching request settles', () => {
    const gate = createAfterSalesEvidenceOpenGate();

    expect(gate.claim('attachment-a')).toBe(true);
    expect(gate.claim('attachment-a')).toBe(false);
    expect(gate.claim('attachment-b')).toBe(false);

    gate.release('attachment-b');
    expect(gate.claim('attachment-b')).toBe(false);

    gate.release('attachment-a');
    expect(gate.claim('attachment-b')).toBe(true);
  });
});
