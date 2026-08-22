import { ApiError } from '../../common/errors/api-error.js';

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

export function deriveOrderPaymentStatus(
  paid: bigint,
  refunded: bigint,
  grandTotal: bigint,
): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' {
  if (refunded > 0n && refunded >= paid) return 'REFUNDED';
  if (refunded > 0n) return 'PARTIALLY_REFUNDED';
  if (paid >= grandTotal) return 'PAID';
  if (paid > 0n) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}
