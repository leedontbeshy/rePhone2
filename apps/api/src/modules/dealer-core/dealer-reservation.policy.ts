import { requireDealerInvariant } from './dealer-invariant-error.js';

export const DEALER_HOLD_DEFAULTS = {
  submissionMilliseconds: 30 * 60 * 1_000,
  balanceMilliseconds: 30 * 60 * 1_000,
  reviewWarningMilliseconds: 120 * 60 * 1_000,
  maximumUnfundedOrders: 3,
} as const;

export type DealerHoldClock =
  | { phase: 'SUBMISSION'; deadlineAt: number }
  | { phase: 'BALANCE'; deadlineAt: number }
  | {
      phase: 'REVIEW';
      origin: 'SUBMISSION';
      remainingMilliseconds: number;
      reviewStartedAt: number;
    }
  | { phase: 'REVIEW'; origin: 'BALANCE'; deadlineAt: number; reviewStartedAt: number };

function assertInstant(value: number): void {
  requireDealerInvariant(Number.isSafeInteger(value) && value >= 0, 'INV-TIMER-01');
}

function addTime(now: number, duration: number): number {
  assertInstant(now);
  requireDealerInvariant(Number.isSafeInteger(duration) && duration >= 0, 'INV-TIMER-01');
  const result = now + duration;
  assertInstant(result);
  return result;
}

function assertClock(clock: DealerHoldClock): void {
  if ('deadlineAt' in clock) assertInstant(clock.deadlineAt);
  if (clock.phase === 'REVIEW') {
    assertInstant(clock.reviewStartedAt);
    if (clock.origin === 'SUBMISSION') assertInstant(clock.remainingMilliseconds);
  }
}

export function startDealerSubmissionClock(now: number): DealerHoldClock {
  return {
    phase: 'SUBMISSION',
    deadlineAt: addTime(now, DEALER_HOLD_DEFAULTS.submissionMilliseconds),
  };
}

export function beginDealerProofReview(clock: DealerHoldClock, now: number): DealerHoldClock {
  assertClock(clock);
  assertInstant(now);
  requireDealerInvariant(clock.phase !== 'REVIEW', 'INV-TIMER-01');
  requireDealerInvariant(now < clock.deadlineAt, 'INV-TIMER-01');
  if (clock.phase === 'BALANCE') {
    return {
      phase: 'REVIEW',
      origin: 'BALANCE',
      deadlineAt: clock.deadlineAt,
      reviewStartedAt: now,
    };
  }
  return {
    phase: 'REVIEW',
    origin: 'SUBMISSION',
    remainingMilliseconds: clock.deadlineAt - now,
    reviewStartedAt: now,
  };
}

export function rejectDealerProof(clock: DealerHoldClock, now: number): DealerHoldClock {
  assertClock(clock);
  assertInstant(now);
  requireDealerInvariant(clock.phase === 'REVIEW' && now >= clock.reviewStartedAt, 'INV-TIMER-01');
  return clock.origin === 'SUBMISSION'
    ? { phase: 'SUBMISSION', deadlineAt: addTime(now, clock.remainingMilliseconds) }
    : { phase: 'BALANCE', deadlineAt: clock.deadlineAt };
}

/** Receipt recording ends the review. An existing balance deadline must be preserved, even if past. */
export function confirmDealerShortfall(clock: DealerHoldClock, now: number): DealerHoldClock {
  assertClock(clock);
  assertInstant(now);
  if (clock.phase === 'REVIEW') {
    requireDealerInvariant(now >= clock.reviewStartedAt, 'INV-TIMER-01');
  }
  if (clock.phase === 'BALANCE' || (clock.phase === 'REVIEW' && clock.origin === 'BALANCE')) {
    return { phase: 'BALANCE', deadlineAt: clock.deadlineAt };
  }
  return { phase: 'BALANCE', deadlineAt: addTime(now, DEALER_HOLD_DEFAULTS.balanceMilliseconds) };
}

/** Caller must also check the locked order is still PLACED and underfunded. */
export function isDealerHoldDue(clock: DealerHoldClock, now: number): boolean {
  assertClock(clock);
  assertInstant(now);
  return clock.phase !== 'REVIEW' && now >= clock.deadlineAt;
}

export function isDealerReviewOverdue(clock: DealerHoldClock, now: number): boolean {
  assertClock(clock);
  assertInstant(now);
  return (
    clock.phase === 'REVIEW' &&
    now >= addTime(clock.reviewStartedAt, DEALER_HOLD_DEFAULTS.reviewWarningMilliseconds)
  );
}
