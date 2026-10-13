import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class FinancialReportQueryDto {
  @ApiPropertyOptional({
    type: String,
    pattern: '^(20[0-9]{2})-(0[1-9]|1[0-2])$',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  public month?: string;
}
export class FinancialSalesDto {
  @ApiProperty({ type: String }) public grossRevenue!: string;
  @ApiProperty({ type: String }) public refunds!: string;
  @ApiProperty({ type: String }) public netRevenue!: string;
  @ApiProperty({ type: String }) public shippingRevenue!: string;
  @ApiProperty({ type: String }) public discounts!: string;
  @ApiProperty({ type: Number }) public orderCount!: number;
  @ApiProperty({ type: Number }) public unitsSold!: number;
}
export class FinancialDayDto extends FinancialSalesDto {
  @ApiProperty({ type: String }) public date!: string;
}
export class FinancialChannelDto extends FinancialSalesDto {
  @ApiProperty({ enum: ['STOREFRONT', 'DEALER'] }) public channel!: 'STOREFRONT' | 'DEALER';
}
export class FinancialCostDto {
  @ApiProperty({ type: String }) public knownCost!: string;
  @ApiProperty({ type: Number }) public missingCostItems!: number;
  @ApiProperty({ type: String, nullable: true }) public estimatedGrossProfit!: string | null;
  @ApiProperty({ type: String }) public stockCapitalKnown!: string;
  @ApiProperty({ type: Number }) public stockCostMissing!: number;
}
export class FinancialReportDto {
  @ApiProperty({ type: String }) public month!: string;
  @ApiProperty({ type: String }) public generatedAt!: string;
  @ApiProperty({ type: () => FinancialSalesDto }) public sales!: FinancialSalesDto;
  @ApiProperty({ type: () => [FinancialDayDto] }) public daily!: FinancialDayDto[];
  @ApiProperty({ type: () => [FinancialChannelDto] }) public channels!: FinancialChannelDto[];
  @ApiProperty({ type: String }) public receivables!: string;
  @ApiProperty({ type: Number }) public stockUnits!: number;
  @ApiPropertyOptional({ type: () => FinancialCostDto }) public costs?: FinancialCostDto;
}
export class FinancialReportResponse {
  @ApiProperty({ type: () => FinancialReportDto }) public data!: FinancialReportDto;
}
