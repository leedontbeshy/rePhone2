/** All amounts are whole VND. Rounding up never sells below the configured floor. */
export function dealerPrice(input: {
  publicPrice: bigint | null;
  acquisitionCost: bigint | null;
  additionalCost: bigint;
  reserve: bigint | null;
  minimumProfit: bigint | null;
  discountBps: number;
  override?: bigint | null;
}): bigint | null {
  const {
    publicPrice,
    acquisitionCost,
    additionalCost,
    reserve,
    minimumProfit,
    discountBps,
    override,
  } = input;
  if (
    publicPrice === null ||
    acquisitionCost === null ||
    reserve === null ||
    minimumProfit === null ||
    publicPrice <= 0n ||
    acquisitionCost < 0n ||
    additionalCost < 0n ||
    reserve < 0n ||
    minimumProfit <= 0n ||
    !Number.isInteger(discountBps) ||
    discountBps < 0 ||
    discountBps > 9900
  )
    return null;
  const floor = acquisitionCost + additionalCost + reserve + minimumProfit;
  const discounted = (publicPrice * BigInt(10_000 - discountBps) + 9_999n) / 10_000n;
  const price = override ?? (discounted > floor ? discounted : floor);
  return price >= floor && price < publicPrice ? price : null;
}
