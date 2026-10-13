import { describe, expect, it, vi } from 'vitest';
import { FinancialReportService } from './financial-report.service.js';
import type {
  FinancialAggregateRow,
  FinancialReportRepository,
} from './financial-report.repository.js';

const row: FinancialAggregateRow = {
  date: '2026-10-01',
  channel: 'STOREFRONT',
  grossRevenue: '12000000',
  refunds: '1000000',
  shippingRevenue: '30000',
  discounts: '200000',
  orderCount: 1,
  unitsSold: 1,
  knownCost: '8000000',
  missingCostItems: 0,
};
function setup(rows: FinancialAggregateRow[] = [row]) {
  const repository = {
    read: vi.fn().mockResolvedValue({
      rows,
      position: {
        receivables: '500000',
        stockUnits: 5,
        stockCapitalKnown: '40000000',
        stockCostMissing: 1,
      },
    }),
  };
  return {
    repository,
    service: new FinancialReportService(repository as unknown as FinancialReportRepository),
  };
}
describe('monthly financial report', () => {
  it('uses Vietnam month boundaries and fills all calendar days, with exact integer money', async () => {
    const { service, repository } = setup([
      row,
      { ...row, channel: 'DEALER', grossRevenue: '999999999999999', refunds: '0' },
    ]);
    const result = await service.get('2026-10', true);
    expect(repository.read).toHaveBeenCalledWith(
      new Date('2026-09-30T17:00:00Z'),
      new Date('2026-10-31T17:00:00Z'),
      true,
    );
    expect(result.daily).toHaveLength(31);
    expect(result.sales.netRevenue).toBe('1000000010999999');
    expect(result.daily[1]?.orderCount).toBe(0);
    expect(result.channels.map((item) => item.orderCount)).toEqual([1, 1]);
  });
  it('does not project any cost or profit fields for employees', async () => {
    const { service, repository } = setup();
    const report = await service.get(undefined, false, new Date('2026-09-30T18:00:00Z'));
    expect(report.month).toBe('2026-10');
    expect(repository.read).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), false);
    expect(JSON.stringify(report)).not.toMatch(/knownCost|stockCapital|missingCost|GrossProfit/);
  });
  it('does not pretend a missing cost is zero profit cost, and permits negative margin', async () => {
    const missing = setup([{ ...row, missingCostItems: 1 }]);
    expect((await missing.service.get('2026-10', true)).costs?.estimatedGrossProfit).toBeNull();
    const loss = setup([{ ...row, knownCost: '13000000' }]);
    expect((await loss.service.get('2026-10', true)).costs?.estimatedGrossProfit).toBe('-2000000');
  });
  it('handles empty and leap-year months', async () => {
    const { service } = setup([]);
    const report = await service.get('2028-02', true);
    expect(report.daily).toHaveLength(29);
    expect(report.sales).toMatchObject({ orderCount: 0, unitsSold: 0, netRevenue: '0' });
  });
});
