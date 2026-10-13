import type { components } from '../../../packages/api-client/src/schema';

export function financialReportFixture(month: string): components['schemas']['FinancialReportDto'] {
  const sales = {
    grossRevenue: '12000000',
    refunds: '1000000',
    netRevenue: '11000000',
    shippingRevenue: '0',
    discounts: '0',
    orderCount: 1,
    unitsSold: 1,
  };
  return {
    month,
    generatedAt: `${month}-01T10:00:00.000Z`,
    sales,
    daily: [{ date: `${month}-01`, ...sales }],
    channels: [{ channel: 'STOREFRONT', ...sales }],
    receivables: '1000000',
    stockUnits: 5,
  };
}
