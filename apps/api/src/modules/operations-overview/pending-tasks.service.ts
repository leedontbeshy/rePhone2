import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import { DealerRuntime } from '../dealers/dealer-runtime.service.js';
import type { PendingTaskCountsDto, PendingTasksDto } from './pending-tasks.dto.js';

@Injectable()
export class PendingTasksService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealerRuntime) private readonly dealerRuntime: DealerRuntime,
    @Inject(AffiliateRuntime) private readonly affiliateRuntime: AffiliateRuntime,
  ) {}

  public async get(isAdmin: boolean): Promise<PendingTasksDto> {
    const dealerEnabled = this.dealerRuntime.enabled;
    const affiliateEnabled = isAdmin && this.affiliateRuntime.enabled;
    // One snapshot, no customer details or finance data, and no paginated-list totals.
    const [row] = await this.prisma.$queryRaw<Required<PendingTaskCountsDto>[]>`
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE status = 'PLACED') AS orders,
        (SELECT COUNT(*)::int FROM payments WHERE status = 'UNDER_REVIEW') AS payments,
        (SELECT COUNT(*)::int FROM refunds
          WHERE dealer_id IS NULL AND status IN ('REQUESTED', 'PROCESSING')) AS refunds,
        (SELECT COUNT(*)::int FROM after_sales_requests
          WHERE status IN ('REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED')) AS "afterSales",
        (SELECT COUNT(*)::int FROM inventory_units
          WHERE lifecycle_status IN ('RECEIVED', 'INSPECTING')) AS inventory,
        CASE WHEN ${dealerEnabled} THEN
          (SELECT COUNT(*)::int FROM dealer_payment_proofs WHERE status = 'UNDER_REVIEW') +
          (SELECT COUNT(*)::int FROM refunds WHERE dealer_id IS NOT NULL
            AND (status = 'REQUESTED' OR (${isAdmin} AND status = 'PROCESSING'))) +
          CASE WHEN ${isAdmin} THEN
            (SELECT COUNT(*)::int FROM dealer_profiles WHERE business_status = 'PENDING') +
            (SELECT COUNT(*)::int FROM dealer_bank_accounts
              WHERE email_confirmed_at IS NOT NULL AND verified_at IS NULL AND disabled_at IS NULL) +
            (SELECT COUNT(*)::int FROM dealer_reconciliation_cases WHERE resolved_at IS NULL)
          ELSE 0 END
        ELSE 0 END AS dealers,
        CASE WHEN ${affiliateEnabled} THEN
          (SELECT COUNT(*)::int FROM affiliate_profiles WHERE status = 'PENDING') +
          (SELECT COUNT(*)::int FROM affiliate_bank_accounts
            WHERE email_confirmed_at IS NOT NULL AND verified_at IS NULL AND disabled_at IS NULL) +
          (SELECT COUNT(*)::int FROM affiliate_payouts
            WHERE status IN ('REQUESTED', 'PROCESSING', 'NEEDS_REVIEW'))
        ELSE 0 END AS affiliates
    `;
    if (row === undefined) throw new Error('Pending task aggregate returned no row');
    const { affiliates, ...shared } = row;
    return {
      generatedAt: new Date().toISOString(),
      counts: { ...shared, ...(isAdmin ? { affiliates } : {}) },
    };
  }
}
