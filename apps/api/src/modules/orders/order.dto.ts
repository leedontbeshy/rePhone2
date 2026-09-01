import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FULFILLMENT_TYPES = ['PICKUP', 'SHIPPING'] as const;
const MONEY_PATTERN = /^\d{1,15}$/;
const ORDER_NUMBER_PATTERN = /^RPH-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export type CheckoutFulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export class CheckoutPreviewRequestDto {
  @ApiProperty({ enum: FULFILLMENT_TYPES })
  @IsIn(FULFILLMENT_TYPES)
  public fulfillmentType!: CheckoutFulfillmentType;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 64 })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(1, 64)
  public voucherCode?: string;
}

export class CheckoutContactDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public fullName!: string;

  @ApiProperty({ type: String, format: 'email', maxLength: 320 })
  @Transform(lower)
  @IsEmail()
  @MaxLength(320)
  public email!: string;

  @ApiProperty({ type: String, minLength: 8, maxLength: 32 })
  @Transform(trim)
  @IsString()
  @Length(8, 32)
  public phone!: string;
}

export class CheckoutShippingAddressDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public receiverName!: string;

  @ApiProperty({ type: String, minLength: 8, maxLength: 32 })
  @Transform(trim)
  @IsString()
  @Length(8, 32)
  public phone!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  public addressLine!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public ward!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public district!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public province!: string;

  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  public postalCode?: string;
}

export class CreateCheckoutRequestDto extends CheckoutPreviewRequestDto {
  @ApiProperty({ type: () => CheckoutContactDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutContactDto)
  public contact!: CheckoutContactDto;

  @ApiPropertyOptional({ type: () => CheckoutShippingAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  public shippingAddress?: CheckoutShippingAddressDto;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public customerNote?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  public expectedCartUpdatedAt!: string;

  @ApiProperty({ type: String, pattern: '^\\d{1,15}$' })
  @Matches(MONEY_PATTERN)
  public expectedGrandTotal!: string;

  @ApiProperty({ type: String, pattern: '^\\d{1,15}$' })
  @Matches(MONEY_PATTERN)
  public expectedDepositRequired!: string;
}

export class CancelOrderDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class OrderNumberParamsDto {
  @ApiProperty({ type: String, example: 'RPH-20260821-23456789' })
  @Transform(upper)
  @Matches(ORDER_NUMBER_PATTERN)
  public orderNumber!: string;
}

export class OrderListQueryDto {
  @ApiPropertyOptional({ enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'])
  public status?: 'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ enum: FULFILLMENT_TYPES })
  @IsOptional()
  @IsIn(FULFILLMENT_TYPES)
  public fulfillmentType?: CheckoutFulfillmentType;

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

  @ApiPropertyOptional({ enum: ['placedAt', 'grandTotal', 'status'], default: 'placedAt' })
  @IsIn(['placedAt', 'grandTotal', 'status'])
  public sortBy: 'placedAt' | 'grandTotal' | 'status' = 'placedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  public sortOrder: 'asc' | 'desc' = 'desc';
}
