import { describe, expect, it, vi } from 'vitest';
import {
  getBackofficeOverview,
  type BackofficeOverviewApiClient,
  type BackofficeOverviewSnapshot,
} from './backoffice-overview-api';

const SNAPSHOT: BackofficeOverviewSnapshot = {
  generatedAt: '2026-08-30T12:00:00.000Z',
  metrics: {
    activeOrders: 7,
    lowStockLevels: 2,
    openAfterSales: 3,
    paymentsUnderReview: 1,
  },
  priorities: [],
  recentOrders: [],
};

describe('getBackofficeOverview', () => {
  it('reads one no-store snapshot and forwards cancellation', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: SNAPSHOT } });
    const controller = new AbortController();

    await expect(
      getBackofficeOverview(
        { GET: get } as unknown as BackofficeOverviewApiClient,
        controller.signal,
      ),
    ).resolves.toEqual(SNAPSHOT);
    expect(get).toHaveBeenCalledWith('/api/v1/backoffice/overview', {
      cache: 'no-store',
      signal: controller.signal,
    });
  });

  it('returns a localized error when the snapshot cannot be read', async () => {
    const get = vi.fn().mockResolvedValue({ error: {} });

    await expect(
      getBackofficeOverview({ GET: get } as unknown as BackofficeOverviewApiClient),
    ).rejects.toThrow('Không thể tải tổng quan vận hành.');
  });
});
