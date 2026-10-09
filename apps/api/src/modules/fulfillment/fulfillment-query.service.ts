import { AffiliateRuntime } from '../affiliate-core/affiliate-runtime.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { FulfillmentOrderGateway } from '../order-transaction-ports/fulfillment-order.gateway.js';
import type { BackofficeOrderListQueryDto } from './fulfillment.dto.js';
import {
  projectBackofficeOrderDetail,
  projectBackofficeOrderListItem,
} from './fulfillment.projector.js';
import type {
  BackofficeOrderDetailDto,
  BackofficeOrderListItemDto,
} from './fulfillment-response.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';

@Injectable()
export class FulfillmentQueryService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
    @Optional() @Inject(AffiliateRuntime) private readonly affiliateRuntime?: AffiliateRuntime,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  public async list(
    query: BackofficeOrderListQueryDto,
  ): Promise<PaginatedApiResult<BackofficeOrderListItemDto>> {
    const placedFrom = query.placedFrom === undefined ? undefined : new Date(query.placedFrom);
    const placedTo = query.placedTo === undefined ? undefined : new Date(query.placedTo);
    if (placedFrom !== undefined && placedTo !== undefined && placedFrom > placedTo) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'placedTo',
          code: 'DATE_RANGE_INVALID',
          message: 'placedTo phải cùng hoặc sau placedFrom.',
        },
      ]);
    }
    const now = this.clock.now();
    const page = await this.orders.list({
      ...(query.q === undefined ? {} : { q: query.q }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.fulfillmentStatus === undefined
        ? {}
        : { fulfillmentStatus: query.fulfillmentStatus }),
      ...(query.paymentStatus === undefined ? {} : { paymentStatus: query.paymentStatus }),
      ...(query.fulfillmentType === undefined ? {} : { fulfillmentType: query.fulfillmentType }),
      ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
      ...(placedFrom === undefined ? {} : { placedFrom }),
      ...(placedTo === undefined ? {} : { placedTo }),
      ...(query.pickupOverdue === undefined ? {} : { pickupOverdue: query.pickupOverdue }),
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      now,
    });
    return new PaginatedApiResult(
      page.orders.map((order) => projectBackofficeOrderListItem(order, now)),
      {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: page.totalItems,
        totalPages: page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / query.pageSize),
      },
    );
  }

  public async detail(id: string): Promise<BackofficeOrderDetailDto> {
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const result = projectBackofficeOrderDetail(order, this.clock.now());
    if (this.affiliateRuntime?.enabled && this.prisma)
      result.hasAffiliateCommission = Boolean(
        await this.prisma.affiliateAttribution.findUnique({
          where: { orderId: id },
          select: { orderId: true },
        }),
      );
    return result;
  }
}
