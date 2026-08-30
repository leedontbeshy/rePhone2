import { ApiError } from '../../common/errors/api-error.js';
export { deriveOrderPaymentStatus } from '../payments/payment-finance.policy.js';

export const PAYMENT_REVIEW_ACTIONS = ['VERIFY', 'REJECT', 'VIEW_EVIDENCE'] as const;
export type PaymentReviewAction = (typeof PAYMENT_REVIEW_ACTIONS)[number];

export interface PaymentReviewActionRecord {
  status: string;
  purpose: string;
  method: string;
  evidenceBucket: string | null;
  evidenceObjectPath: string | null;
  submittedAt: Date | null;
  order: {
    status: string;
    fulfillmentStatus: string;
  };
}

export function availablePaymentReviewActions(
  payment: PaymentReviewActionRecord,
): PaymentReviewAction[] {
  const evidenceAvailable = hasCompleteEvidence(payment);
  return [
    ...(isPaymentReviewable(payment) ? (['VERIFY', 'REJECT'] as const) : []),
    ...(evidenceAvailable ? (['VIEW_EVIDENCE'] as const) : []),
  ];
}

export function isPaymentReviewable(payment: PaymentReviewActionRecord): boolean {
  return (
    payment.status === 'UNDER_REVIEW' &&
    payment.purpose === 'DEPOSIT' &&
    payment.method === 'BANK_TRANSFER' &&
    hasCompleteEvidence(payment) &&
    payment.submittedAt !== null &&
    payment.order.status === 'PLACED' &&
    payment.order.fulfillmentStatus === 'PENDING'
  );
}

function hasCompleteEvidence(
  payment: Pick<PaymentReviewActionRecord, 'evidenceBucket' | 'evidenceObjectPath'>,
): boolean {
  return payment.evidenceBucket !== null && payment.evidenceObjectPath !== null;
}

export interface VerificationAmounts {
  receivedAmount: bigint;
  note: string | null;
}

export function validateVerificationAmounts(input: {
  receivedAmount: string;
  requiredAmount: string;
  expectedAmount: string;
  note?: string;
}): VerificationAmounts {
  if (!/^[1-9]\d{0,14}$/.test(input.receivedAmount)) {
    throw new ApiError('VALIDATION_FAILED');
  }
  const receivedAmount = BigInt(input.receivedAmount);
  if (receivedAmount < BigInt(input.requiredAmount)) {
    throw new ApiError('DEPOSIT_AMOUNT_INSUFFICIENT');
  }
  const note = normalizeOptionalText(input.note);
  if (receivedAmount !== BigInt(input.expectedAmount) && note === null) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'note',
        code: 'REVIEW_NOTE_REQUIRED',
        message: 'Cần ghi chú khi số tiền nhận khác số tiền dự kiến.',
      },
    ]);
  }
  return { receivedAmount, note };
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}
