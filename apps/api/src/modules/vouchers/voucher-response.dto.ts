import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  DiscountType,
  VoucherScopeType,
  VoucherStatus,
  VoucherUsageStatus,
  VoucherVisibility,
} from '../../generated/prisma/enums.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

export class PublicVoucherDto {
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public description!: string | null;
  @ApiProperty({ enum: ['FIXED', 'PERCENT'] }) public discountType!: DiscountType;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public discountValue!: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public maxDiscountAmount!: string | null;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public minimumOrderAmount!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public endsAt!: Date;
  @ApiProperty({ enum: ['PUBLIC', 'ACCOUNT_ONLY'] }) public visibility!: VoucherVisibility;
  @ApiProperty({ type: String }) public scopeSummary!: string;
}

export class VoucherListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class PublicVoucherListResponse {
  @ApiProperty({ type: () => [PublicVoucherDto] }) public data!: PublicVoucherDto[];
  @ApiProperty({ type: () => VoucherListMetaDto }) public meta!: VoucherListMetaDto;
}

export class VoucherUsageCountsDto {
  @ApiProperty({ type: Number }) public reserved!: number;
  @ApiProperty({ type: Number }) public consumed!: number;
  @ApiProperty({ type: Number }) public released!: number;
}

export class BackofficeVoucherDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public description!: string | null;
  @ApiProperty({ enum: ['FIXED', 'PERCENT'] }) public discountType!: DiscountType;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public discountValue!: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public maxDiscountAmount!: string | null;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public minimumOrderAmount!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public endsAt!: Date;
  @ApiPropertyOptional({ type: Number, nullable: true }) public totalUsageLimit!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) public perCustomerLimit!: number | null;
  @ApiProperty({ enum: ['PUBLIC', 'ACCOUNT_ONLY'] }) public visibility!: VoucherVisibility;
  @ApiProperty({ enum: ['ORDER', 'PRODUCT_TYPE', 'PRODUCTS', 'VARIANTS'] })
  public scopeType!: VoucherScopeType;
  @ApiPropertyOptional({ type: Object, nullable: true })
  public scopeConfig!: Record<string, unknown> | null;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] })
  public status!: VoucherStatus;
  @ApiProperty({ type: () => VoucherUsageCountsDto }) public usageCounts!: VoucherUsageCountsDto;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class BackofficeVoucherResponse {
  @ApiProperty({ type: () => BackofficeVoucherDto }) public data!: BackofficeVoucherDto;
}

export class BackofficeVoucherListResponse {
  @ApiProperty({ type: () => [BackofficeVoucherDto] }) public data!: BackofficeVoucherDto[];
  @ApiProperty({ type: () => VoucherListMetaDto }) public meta!: VoucherListMetaDto;
}

export class VoucherUsageDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public orderId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public customerId!: string | null;
  @ApiProperty({ enum: ['RESERVED', 'CONSUMED', 'RELEASED'] })
  public status!: VoucherUsageStatus;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public consumedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public releasedAt!: Date | null;
}

export class VoucherUsageListResponse {
  @ApiProperty({ type: () => [VoucherUsageDto] }) public data!: VoucherUsageDto[];
  @ApiProperty({ type: () => VoucherListMetaDto }) public meta!: VoucherListMetaDto;
}
