import { z } from 'zod';
import { ApiError } from '../../common/errors/api-error.js';

const productTypeScopeSchema = z.object({ productType: z.enum(['IPHONE', 'ACCESSORY']) }).strict();
const productsScopeSchema = z
  .object({ productIds: z.array(z.uuid()).min(1).max(100) })
  .strict()
  .superRefine(({ productIds }, context) => {
    rejectDuplicates(productIds, 'productIds', context);
  });
const variantsScopeSchema = z
  .object({ variantIds: z.array(z.uuid()).min(1).max(100) })
  .strict()
  .superRefine(({ variantIds }, context) => {
    rejectDuplicates(variantIds, 'variantIds', context);
  });

export type VoucherScope =
  | { type: 'ORDER' }
  | { type: 'PRODUCT_TYPE'; productType: 'IPHONE' | 'ACCESSORY' }
  | { type: 'PRODUCTS'; productIds: string[] }
  | { type: 'VARIANTS'; variantIds: string[] };

export interface VoucherDiscountRule {
  discountType: 'FIXED' | 'PERCENT';
  discountValue: string;
  maxDiscountAmount: string | null;
  minimumOrderAmount: string;
  scope: VoucherScope;
}

export interface VoucherLine {
  cartItemId: string;
  productId: string;
  productType: 'IPHONE' | 'ACCESSORY';
  variantId: string;
  lineSubtotal: string;
}

export interface VoucherDiscountResult {
  eligibleSubtotal: string;
  discountAmount: string;
  allocations: Array<{ cartItemId: string; amount: string }>;
}

export function parseVoucherScope(scopeType: string, scopeConfig: unknown): VoucherScope {
  if (scopeType === 'ORDER') {
    if (scopeConfig !== null && scopeConfig !== undefined) throw invalidScope();
    return { type: 'ORDER' };
  }
  if (scopeType === 'PRODUCT_TYPE') {
    const parsed = productTypeScopeSchema.safeParse(scopeConfig);
    if (!parsed.success) throw invalidScope(parsed.error.issues);
    return { type: 'PRODUCT_TYPE', productType: parsed.data.productType };
  }
  if (scopeType === 'PRODUCTS') {
    const parsed = productsScopeSchema.safeParse(scopeConfig);
    if (!parsed.success) throw invalidScope(parsed.error.issues);
    return { type: 'PRODUCTS', productIds: parsed.data.productIds };
  }
  if (scopeType === 'VARIANTS') {
    const parsed = variantsScopeSchema.safeParse(scopeConfig);
    if (!parsed.success) throw invalidScope(parsed.error.issues);
    return { type: 'VARIANTS', variantIds: parsed.data.variantIds };
  }
  throw invalidScope();
}

export function calculateVoucherDiscount(
  rule: VoucherDiscountRule,
  lines: readonly VoucherLine[],
): VoucherDiscountResult {
  const eligible = lines
    .filter((line) => isEligible(rule.scope, line))
    .map((line) => ({ ...line, subtotal: money(line.lineSubtotal) }));
  const eligibleSubtotal = eligible.reduce((total, line) => total + line.subtotal, 0n);
  if (eligibleSubtotal < money(rule.minimumOrderAmount)) {
    throw new ApiError('VOUCHER_NOT_APPLICABLE');
  }

  let discount =
    rule.discountType === 'FIXED'
      ? money(rule.discountValue)
      : (eligibleSubtotal * money(rule.discountValue)) / 100n;
  if (rule.maxDiscountAmount !== null) {
    discount = min(discount, money(rule.maxDiscountAmount));
  }
  discount = min(discount, eligibleSubtotal);
  if (discount <= 0n || eligible.length === 0) {
    throw new ApiError('VOUCHER_NOT_APPLICABLE');
  }

  const sorted = [...eligible].sort((left, right) =>
    left.cartItemId.localeCompare(right.cartItemId),
  );
  const allocations = sorted.map((line) => ({
    cartItemId: line.cartItemId,
    amount: (discount * line.subtotal) / eligibleSubtotal,
  }));
  let remainder = discount - allocations.reduce((total, item) => total + item.amount, 0n);
  for (const allocation of allocations) {
    if (remainder === 0n) break;
    allocation.amount += 1n;
    remainder -= 1n;
  }

  return {
    eligibleSubtotal: eligibleSubtotal.toString(),
    discountAmount: discount.toString(),
    allocations: allocations.map(({ cartItemId, amount }) => ({
      cartItemId,
      amount: amount.toString(),
    })),
  };
}

function isEligible(scope: VoucherScope, line: VoucherLine): boolean {
  switch (scope.type) {
    case 'ORDER':
      return true;
    case 'PRODUCT_TYPE':
      return line.productType === scope.productType;
    case 'PRODUCTS':
      return scope.productIds.includes(line.productId);
    case 'VARIANTS':
      return scope.variantIds.includes(line.variantId);
  }
}

function money(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new ApiError('VALIDATION_FAILED');
  return BigInt(value);
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function rejectDuplicates(values: readonly string[], path: string, context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', path: [path], message: 'must not contain duplicates' });
  }
}

function invalidScope(issues: readonly z.core.$ZodIssue[] = []): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, [
    {
      field: 'scopeConfig',
      code: 'INVALID_SCOPE_CONFIG',
      message: issues[0]?.message ?? 'Cấu hình phạm vi voucher không hợp lệ.',
    },
  ]);
}
