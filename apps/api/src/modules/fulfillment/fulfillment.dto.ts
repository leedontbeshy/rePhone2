import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] as const;
const FULFILLMENT_STATUSES = [
  'PENDING',
  'PREPARING',
  'READY',
  'IN_TRANSIT',
  'COMPLETED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
] as const;
const PAYMENT_STATUSES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
const FULFILLMENT_TYPES = ['PICKUP', 'SHIPPING'] as const;
const SORT_FIELDS = ['placedAt', 'updatedAt', 'grandTotal', 'pickupHoldUntil'] as const;
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
const booleanQuery = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class BackofficeOrderIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class BackofficeOrderListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public q?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  public status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional({ enum: FULFILLMENT_STATUSES })
  @IsOptional()
  @IsIn(FULFILLMENT_STATUSES)
  public fulfillmentStatus?: (typeof FULFILLMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  public paymentStatus?: (typeof PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: FULFILLMENT_TYPES })
  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  public fulfillmentType?: (typeof FULFILLMENT_TYPES)[number];

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public locationId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public placedFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public placedTo?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(booleanQuery)
  @IsOptional()
  @IsBoolean()
  public pickupOverdue?: boolean;

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

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'placedAt' })
  @IsIn(SORT_FIELDS)
  public sortBy: (typeof SORT_FIELDS)[number] = 'placedAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class UpdateBackofficeOrderInternalNoteDto {
  @ApiProperty({ type: String, nullable: true, minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(1, 2000)
  public internalNote!: string | null;
}

export class ExtendPickupHoldDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  public holdUntil!: string;

  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class CompletePickupDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  public confirmCashCollected?: boolean;
}

export class OverrideShippingFeeDto {
  @ApiProperty({ type: String, pattern: '^\\d{1,15}$' })
  @Matches(/^\d{1,15}$/)
  public shippingFee!: string;

  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class CreateShipmentDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public carrierName!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public trackingCode!: string;

  @ApiPropertyOptional({ type: String, format: 'uri', maxLength: 2048 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  @Matches(/^https:\/\/(?![^/?#]*@)/i, {
    message: 'trackingUrl must not include username or password credentials',
  })
  @MaxLength(2048)
  public trackingUrl?: string;
}

export class ShipmentIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class MarkShipmentDeliveredDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  public confirmCodCollected?: boolean;
}

export class MarkShipmentFailedDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class MarkShipmentReturnedDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public returnedToLocationId!: string;

  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
