import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const REFUND_STATUSES = [
  'REQUESTED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export const REFUND_METHODS = ['BANK_TRANSFER', 'CASH', 'OTHER'] as const;
export const CREATE_REFUND_METHODS = ['BANK_TRANSFER', 'CASH'] as const;
const REFUND_SORT_FIELDS = ['createdAt', 'amount', 'processingAt'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class RefundIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class RefundOrderIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class BackofficeRefundListQueryDto {
  @ApiPropertyOptional({ enum: REFUND_STATUSES })
  @IsOptional()
  @IsIn(REFUND_STATUSES)
  public status?: (typeof REFUND_STATUSES)[number];

  @ApiPropertyOptional({ enum: REFUND_METHODS })
  @IsOptional()
  @IsIn(REFUND_METHODS)
  public method?: (typeof REFUND_METHODS)[number];

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public orderNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdTo?: string;

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

  @ApiPropertyOptional({ enum: REFUND_SORT_FIELDS, default: 'createdAt' })
  @IsIn(REFUND_SORT_FIELDS)
  public sortBy: (typeof REFUND_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class RefundAllocationDto {
  @ApiProperty({ enum: ['ITEM', 'SHIPPING', 'OVERPAYMENT'] })
  @IsIn(['ITEM', 'SHIPPING', 'OVERPAYMENT'])
  public kind!: 'ITEM' | 'SHIPPING' | 'OVERPAYMENT';
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public orderItemId?: string;
  @ApiProperty({ type: String })
  @Matches(/^[1-9]\d{0,14}$/)
  public amount!: string;
}

export class CreateRefundDto {
  @ApiPropertyOptional({ type: [RefundAllocationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RefundAllocationDto)
  public allocations?: RefundAllocationDto[];

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public paymentId?: string;

  @ApiProperty({ type: String, pattern: '^[1-9][0-9]{0,14}$' })
  @Matches(/^[1-9]\d{0,14}$/)
  public amount!: string;

  @ApiProperty({ enum: CREATE_REFUND_METHODS })
  @IsIn(CREATE_REFUND_METHODS)
  public method!: (typeof CREATE_REFUND_METHODS)[number];

  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class StartRefundProcessingDto {
  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(5, 500)
  public note?: string;
}

export class CompleteRefundDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public note!: string;
}

export class TerminalRefundDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
