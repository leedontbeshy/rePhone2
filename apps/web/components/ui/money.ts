export type VndAmount = bigint | string;

export function formatVnd(amount: VndAmount) {
  const normalized = typeof amount === 'bigint' ? amount.toString() : amount.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new TypeError('VND amount must be an integer string or bigint.');
  }

  const value = BigInt(normalized);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative ? '-' : ''}${grouped}\u00a0₫`;
}
