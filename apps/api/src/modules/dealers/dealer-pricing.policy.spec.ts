import { describe, expect, it } from 'vitest';
import { dealerPrice } from './dealer-pricing.policy.js';

const price = {
  publicPrice: 10_000_000n,
  acquisitionCost: 8_000_000n,
  additionalCost: 100_000n,
  reserve: 200_000n,
  minimumProfit: 300_000n,
  discountBps: 500,
};
describe('dealer price floor', () => {
  it('offers 9.5 million on a 10 million retail machine when the floor permits', () => {
    expect(dealerPrice(price)).toBe(9_500_000n);
  });
  it('raises the offer to the complete cost floor and never rounds below it', () => {
    expect(dealerPrice({ ...price, acquisitionCost: 9_000_000n })).toBe(9_600_000n);
    expect(dealerPrice({ ...price, publicPrice: 10_000_001n })).toBe(9_500_001n);
  });
  it('fails closed for missing costs, invalid discounts, floor violations and no dealer advantage', () => {
    for (const input of [
      { acquisitionCost: null },
      { reserve: null },
      { minimumProfit: null },
      { discountBps: -1 },
      { discountBps: 500.5 },
      { override: 8_000_000n },
      { override: 10_000_000n },
      { acquisitionCost: 9_500_000n },
    ]) {
      expect(dealerPrice({ ...price, ...input })).toBeNull();
    }
    expect(dealerPrice({ ...price, override: 9_000_000n })).toBe(9_000_000n);
  });
});
