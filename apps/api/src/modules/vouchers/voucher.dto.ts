import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  type VoucherScopeConfigDto,
  voucherScopeConfigOpenApiSchemas,
} from './voucher-scope.dto.js';

const DISCOUNT_TYPES = ['FIXED', 'PERCENT'] as const;
const VISIBILITIES = ['PUBLIC', 'ACCOUNT_ONLY'] as const;
const SCOPE_TYPES = ['ORDER', 'PRODUCT_TYPE', 'PRODUCTS', 'VARIANTS'] as const;
const VOUCHER_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
const USAGE_STATUSES = ['RESERVED', 'CONSUMED', 'RELEASED'] as const;
const MONEY_PATTERN = /^\d{1,15}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const uppercase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class CreateVoucherDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  @Transform(uppercase)
  @IsString()
  @Length(1, 64)
  public code!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 2_000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public description?: string | null;

  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  public discountType!: (typeof DISCOUNT_TYPES)[number];

  @ApiProperty({ type: String, pattern: '^\\d{1,15}$' })
  @Matches(MONEY_PATTERN)
  public discountValue!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d{1,15}$', nullable: true })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  public maxDiscountAmount?: string | null;

  @ApiProperty({ type: String, pattern: '^\\d{1,15}$' })
  @Matches(MONEY_PATTERN)
  public minimumOrderAmount!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  public startsAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  public endsAt!: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  public totalUsageLimit?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  public perCustomerLimit?: number | null;

  @ApiProperty({ enum: VISIBILITIES })
  @IsIn(VISIBILITIES)
  public visibility!: (typeof VISIBILITIES)[number];

  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn(SCOPE_TYPES)
  public scopeType!: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Null for ORDER; otherwise the object shape must match scopeType. The service validates this relationship strictly.',
    oneOf: voucherScopeConfigOpenApiSchemas(),
  })
  @IsOptional()
  @IsObject()
  public scopeConfig?: VoucherScopeConfigDto | null;
}

export class UpdateVoucherDto extends PartialType(OmitType(CreateVoucherDto, ['code'] as const)) {}

export class VoucherReasonDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class VoucherParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class PublicVoucherListQueryDto {
  @ApiPropertyOptional({ enum: VISIBILITIES })
  @IsOptional()
  @IsIn(VISIBILITIES)
  public visibility?: (typeof VISIBILITIES)[number];

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;
}

export class BackofficeVoucherListQueryDto extends PublicVoucherListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public q?: string;

  @ApiPropertyOptional({ enum: VOUCHER_STATUSES })
  @IsOptional()
  @IsIn(VOUCHER_STATUSES)
  public status?: (typeof VOUCHER_STATUSES)[number];

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES })
  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  public discountType?: (typeof DISCOUNT_TYPES)[number];

  @ApiPropertyOptional({ enum: SCOPE_TYPES })
  @IsOptional()
  @IsIn(SCOPE_TYPES)
  public scopeType?: (typeof SCOPE_TYPES)[number];
}

export class VoucherUsageListQueryDto {
  @ApiPropertyOptional({ enum: USAGE_STATUSES })
  @IsOptional()
  @IsIn(USAGE_STATUSES)
  public status?: (typeof USAGE_STATUSES)[number];

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public orderId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public customerId?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;
}
