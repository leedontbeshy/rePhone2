import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MOVEMENT_TYPES = [
  'RECEIPT',
  'SALE',
  'RETURN',
  'TRANSFER',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'WRITE_OFF',
] as const;

const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const queryBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result.length === 0 ? undefined : result;
};

export class StockPaginationDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;
}

export class StockLevelListQueryDto extends StockPaginationDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public variantId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public locationId?: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  public lowStock?: boolean;
}

export class StockMovementListQueryDto extends StockPaginationDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public variantId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public locationId?: string;
  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  public type?: (typeof MOVEMENT_TYPES)[number];
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public dateFrom?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public dateTo?: string;
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public referenceType?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public referenceId?: string;
}

class StockQuantityDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public variantId!: string;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) public quantity!: number;
}

export class ReceiveStockDto extends StockQuantityDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public locationId!: string;
  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason?: string;
}

export class TransferStockDto extends StockQuantityDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public fromLocationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public toLocationId!: string;
  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason?: string;
}

export class AdjustStockDto extends StockQuantityDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public locationId!: string;
  @ApiProperty({ enum: ['IN', 'OUT'] }) @IsIn(['IN', 'OUT']) public direction!: 'IN' | 'OUT';
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class ReturnStockDto extends StockQuantityDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public locationId!: string;
  @ApiProperty({ enum: ['SHIPMENT', 'AFTER_SALES_REQUEST'] })
  @Transform(optionalTrim)
  @IsIn(['SHIPMENT', 'AFTER_SALES_REQUEST'])
  public referenceType!: 'SHIPMENT' | 'AFTER_SALES_REQUEST';
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public referenceId!: string;
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
