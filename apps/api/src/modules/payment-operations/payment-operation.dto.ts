import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PAYMENT_STATUSES = [
  'AWAITING_PROOF',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;
const PAYMENT_PURPOSES = ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] as const;
const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] as const;
const PAYMENT_SORT_FIELDS = ['submittedAt', 'expiresAt', 'createdAt', 'expectedAmount'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const booleanQuery = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class PaymentIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public paymentId!: string;
}

export class BackofficePaymentIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class BackofficePaymentListQueryDto {
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES, default: 'UNDER_REVIEW' })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  public status?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_PURPOSES })
  @IsOptional()
  @IsIn(PAYMENT_PURPOSES)
  public purpose?: (typeof PAYMENT_PURPOSES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  public method?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ type: Boolean })
  @Transform(booleanQuery)
  @IsOptional()
  @IsBoolean()
  public reviewOverdue?: boolean;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public orderNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public submittedFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public submittedTo?: string;

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

  @ApiPropertyOptional({ enum: PAYMENT_SORT_FIELDS, default: 'submittedAt' })
  @IsIn(PAYMENT_SORT_FIELDS)
  public sortBy: (typeof PAYMENT_SORT_FIELDS)[number] = 'submittedAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'asc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'asc';
}

export class VerifyPaymentDto {
  @ApiProperty({ type: String, pattern: '^[1-9][0-9]{0,14}$' })
  @Matches(/^[1-9]\d{0,14}$/)
  public receivedAmount!: string;

  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(5, 500)
  public note?: string;
}

export class RejectPaymentDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
