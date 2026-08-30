import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const OVERVIEW_PRIORITY_KEYS = [
  'PAYMENT_REVIEW_OVERDUE',
  'PICKUP_OVERDUE',
  'REFUND_REQUESTED',
  'AFTER_SALES_REQUESTED',
] as const;

export type OverviewPriorityKey = (typeof OVERVIEW_PRIORITY_KEYS)[number];

export class OperationsOverviewMetricsDto {
  @ApiProperty({ type: Number, minimum: 0 }) public activeOrders!: number;
  @ApiProperty({ type: Number, minimum: 0 }) public paymentsUnderReview!: number;
  @ApiProperty({ type: Number, minimum: 0 }) public openAfterSales!: number;
  @ApiProperty({ type: Number, minimum: 0 }) public lowStockLevels!: number;
}

export class OperationsOverviewPriorityDto {
  @ApiProperty({ enum: OVERVIEW_PRIORITY_KEYS }) public key!: OverviewPriorityKey;
  @ApiProperty({ type: Number, minimum: 0 }) public count!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public oldestAt!: string | null;
  @ApiProperty({ type: String }) public href!: string;
}

export class OperationsOverviewRecentOrderDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public customerName!: string;
  @ApiProperty({ enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] })
  public status!: string;
  @ApiProperty({
    enum: ['PENDING', 'PREPARING', 'READY', 'IN_TRANSIT', 'COMPLETED', 'FAILED', 'RETURNED', 'CANCELLED'],
  })
  public fulfillmentStatus!: string;
  @ApiProperty({
    enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  })
  public paymentStatus!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
}

export class OperationsOverviewDto {
  @ApiProperty({ type: String, format: 'date-time' }) public generatedAt!: string;
  @ApiProperty({ type: () => OperationsOverviewMetricsDto })
  public metrics!: OperationsOverviewMetricsDto;
  @ApiProperty({ type: () => [OperationsOverviewPriorityDto] })
  public priorities!: OperationsOverviewPriorityDto[];
  @ApiProperty({ type: () => [OperationsOverviewRecentOrderDto] })
  public recentOrders!: OperationsOverviewRecentOrderDto[];
}

export class OperationsOverviewResponse {
  @ApiProperty({ type: () => OperationsOverviewDto }) public data!: OperationsOverviewDto;
}
