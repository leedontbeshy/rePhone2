import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PendingTaskCountsDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'Orders awaiting confirmation (PLACED).' })
  public orders!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Payments UNDER_REVIEW.' })
  public payments!: number;
  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Storefront refunds REQUESTED or PROCESSING.',
  })
  public refunds!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Open after-sales requests.' })
  public afterSales!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Units RECEIVED or INSPECTING.' })
  public inventory!: number;
  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Dealer tasks actionable by the current role.',
  })
  public dealers!: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Affiliate tasks; ADMIN only.' })
  public affiliates?: number;
}

export class PendingTasksDto {
  @ApiProperty({ type: String, format: 'date-time' }) public generatedAt!: string;
  @ApiProperty({ type: () => PendingTaskCountsDto }) public counts!: PendingTaskCountsDto;
}

export class PendingTasksResponse {
  @ApiProperty({ type: () => PendingTasksDto }) public data!: PendingTasksDto;
}
