export type DealerInvariantCode =
  'INV-MONEY-01' | 'INV-ALLOC-01' | 'INV-REF-01' | 'INV-REF-02' | 'INV-SHIP-01' | 'INV-TIMER-01';

export class DealerInvariantError extends Error {
  public constructor(public readonly invariant: DealerInvariantCode) {
    super(invariant);
    this.name = 'DealerInvariantError';
  }
}

export function requireDealerInvariant(
  condition: boolean,
  invariant: DealerInvariantCode,
): asserts condition {
  if (!condition) throw new DealerInvariantError(invariant);
}
