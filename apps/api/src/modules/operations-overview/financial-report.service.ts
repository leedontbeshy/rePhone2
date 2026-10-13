import { Inject, Injectable } from '@nestjs/common';
import {
  FinancialReportRepository,
  type FinancialAggregateRow,
} from './financial-report.repository.js';
import type { FinancialReportDto, FinancialSalesDto } from './financial-report.dto.js';

@Injectable()
export class FinancialReportService {
  public constructor(
    @Inject(FinancialReportRepository) private readonly repository: FinancialReportRepository,
  ) {}
  public async get(
    month: string | undefined,
    admin: boolean,
    now = new Date(),
  ): Promise<FinancialReportDto> {
    const selectedMonth = month ?? new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 7);
    const year = Number(selectedMonth.slice(0, 4));
    const monthNumber = Number(selectedMonth.slice(5));
    const start = new Date(Date.UTC(year, monthNumber - 1, 1) - 7 * 3600000);
    const end = new Date(Date.UTC(year, monthNumber, 1) - 7 * 3600000);
    const { rows, position } = await this.repository.read(start, end, admin);
    const sales = summarizeSales(rows);
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const knownCost = sumMoney(rows, 'knownCost');
    const missingCostItems = rows.reduce((sum, row) => sum + row.missingCostItems, 0);
    return {
      month: selectedMonth,
      generatedAt: now.toISOString(),
      sales,
      daily: Array.from({ length: days }, (_, index) => {
        const date = `${selectedMonth}-${String(index + 1).padStart(2, '0')}`;
        return { date, ...summarizeSales(rows.filter((row) => row.date === date)) };
      }),
      channels: (['STOREFRONT', 'DEALER'] as const).map((channel) => ({
        channel,
        ...summarizeSales(rows.filter((row) => row.channel === channel)),
      })),
      receivables: position.receivables,
      stockUnits: position.stockUnits,
      ...(admin
        ? {
            costs: {
              knownCost,
              missingCostItems,
              estimatedGrossProfit:
                missingCostItems > 0
                  ? null
                  : (BigInt(sales.netRevenue) - BigInt(knownCost)).toString(),
              stockCapitalKnown: position.stockCapitalKnown,
              stockCostMissing: position.stockCostMissing,
            },
          }
        : {}),
    };
  }
}
function sumMoney(
  rows: readonly FinancialAggregateRow[],
  key: 'grossRevenue' | 'refunds' | 'shippingRevenue' | 'discounts' | 'knownCost',
): string {
  return rows.reduce((sum, row) => sum + BigInt(row[key]), 0n).toString();
}
export function summarizeSales(
  rows: readonly FinancialAggregateRow[],
): Pick<FinancialSalesDto, keyof FinancialSalesDto> {
  const grossRevenue = sumMoney(rows, 'grossRevenue');
  const refunds = sumMoney(rows, 'refunds');
  return {
    grossRevenue,
    refunds,
    netRevenue: (BigInt(grossRevenue) - BigInt(refunds)).toString(),
    shippingRevenue: sumMoney(rows, 'shippingRevenue'),
    discounts: sumMoney(rows, 'discounts'),
    orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
    unitsSold: rows.reduce((sum, row) => sum + row.unitsSold, 0),
  };
}
