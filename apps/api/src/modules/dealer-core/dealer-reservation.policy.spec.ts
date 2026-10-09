import { describe, expect, it } from 'vitest';
import {
  beginDealerProofReview,
  confirmDealerShortfall,
  isDealerHoldDue,
  isDealerReviewOverdue,
  rejectDealerProof,
  startDealerSubmissionClock,
} from './dealer-reservation.policy.js';
import { DealerInvariantError } from './dealer-invariant-error.js';

const minute = 60_000;

describe('INV-TIMER-01: dealer submission and absolute balance deadlines', () => {
  it('rejecting a proof returns only the unused part of the submission window', () => {
    const initial = startDealerSubmissionClock(0);
    const review = beginDealerProofReview(initial, 25 * minute);
    const resumed = rejectDealerProof(review, 100 * minute);
    expect(resumed).toEqual({ phase: 'SUBMISSION', deadlineAt: 105 * minute });
    expect(isDealerHoldDue(resumed, 105 * minute)).toBe(true);
  });

  it('multiple reviews do not replenish the submission time budget', () => {
    let clock = startDealerSubmissionClock(0);
    clock = beginDealerProofReview(clock, 25 * minute);
    clock = rejectDealerProof(clock, 100 * minute);
    clock = beginDealerProofReview(clock, 102 * minute);
    clock = rejectDealerProof(clock, 200 * minute);
    expect(clock).toEqual({ phase: 'SUBMISSION', deadlineAt: 203 * minute });
  });

  it('does not expire a hold during review, even after the warning threshold', () => {
    const review = beginDealerProofReview(startDealerSubmissionClock(0), minute);
    expect(isDealerHoldDue(review, 1_000 * minute)).toBe(false);
    expect(isDealerReviewOverdue(review, 120 * minute)).toBe(false);
    expect(isDealerReviewOverdue(review, 121 * minute)).toBe(true);
  });

  it('rejects proof at the deadline and a second simultaneous review', () => {
    const initial = startDealerSubmissionClock(0);
    expect(() => beginDealerProofReview(initial, 30 * minute)).toThrow(
      new DealerInvariantError('INV-TIMER-01'),
    );
    const review = beginDealerProofReview(initial, minute);
    expect(() => beginDealerProofReview(review, 2 * minute)).toThrow(
      new DealerInvariantError('INV-TIMER-01'),
    );
  });

  it('sets the balance deadline only once across repeated partial transfers', () => {
    const first = confirmDealerShortfall(startDealerSubmissionClock(0), 20 * minute);
    expect(first).toEqual({ phase: 'BALANCE', deadlineAt: 50 * minute });
    const second = confirmDealerShortfall(beginDealerProofReview(first, 40 * minute), 60 * minute);
    expect(second).toEqual(first);
    expect(isDealerHoldDue(second, 60 * minute)).toBe(true);
  });

  it('reviewing a balance proof does not extend the absolute balance deadline', () => {
    const balance = confirmDealerShortfall(startDealerSubmissionClock(0), 20 * minute);
    const review = beginDealerProofReview(balance, 49 * minute);
    expect(isDealerHoldDue(review, 70 * minute)).toBe(false);
    const resumed = rejectDealerProof(review, 70 * minute);
    expect(isDealerHoldDue(resumed, 70 * minute)).toBe(true);
  });

  it('rejects invalid or backwards clock values', () => {
    expect(() => startDealerSubmissionClock(Number.NaN)).toThrow(DealerInvariantError);
    expect(() => startDealerSubmissionClock(Number.MAX_SAFE_INTEGER)).toThrow(DealerInvariantError);
    expect(() =>
      rejectDealerProof(beginDealerProofReview(startDealerSubmissionClock(0), minute), 0),
    ).toThrow(DealerInvariantError);
  });
});
