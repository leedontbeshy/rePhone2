import { createHash } from 'node:crypto';

export const AFFILIATE_COOKIE = 'rephone_referral';
export const AFFILIATE_TERMS = 'affiliate-v1.0';
export const AFFILIATE_HOLD_MS = 14 * 86400_000;
export const AFFILIATE_WINDOW_MS = 30 * 86400_000;
export const AFFILIATE_MIN_PAYOUT = 200_000n;
export const affiliateHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const money = (value: { toString(): string }): bigint => BigInt(value.toString());
export const normalizePhone = (value: string): string =>
  value.replace(/\D/g, '').replace(/^84/, '0');

export function commissionAmount(base: bigint, floor: bigint, rateBps: number): bigint {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 500 || base <= 0n) return 0n;
  const requested = (base * BigInt(rateBps)) / 10_000n;
  const headroom = base > floor ? base - floor : 0n;
  return requested < headroom ? requested : headroom;
}

export interface RefundAllocation {
  kind: 'ITEM' | 'SHIPPING' | 'OVERPAYMENT';
  orderItemId?: string;
  amount: string;
}

export function readAllocations(value: unknown): RefundAllocation[] {
  if (!Array.isArray(value)) return [];
  return value as RefundAllocation[];
}
