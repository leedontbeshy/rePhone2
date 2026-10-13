import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PRODUCT_TYPES = ['IPHONE', 'ACCESSORY'] as const;
export const PRODUCT_SORT_FIELDS = [
  'createdAt',
  'name',
  'fromPrice',
  'releaseYear',
  'generation',
] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

const normalizeSearch = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length === 0 ? undefined : normalized;
};

const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};

const strictInteger = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    return value;
  }
  return Number(value);
};

const strictBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
};

export class ProductListQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 64 })
  @Transform(strictInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  public ramGb?: number;

  @ApiPropertyOptional({ enum: ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'])
  public simLockStatus?: 'UNLOCKED' | 'CARRIER_LOCKED' | 'UNKNOWN';

  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @Transform(normalizeSearch)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public q?: string;

  @ApiPropertyOptional({ type: String, enum: PRODUCT_TYPES })
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  public productType?: (typeof PRODUCT_TYPES)[number];

  @ApiPropertyOptional({ type: Number, minimum: 2007, maximum: 2100 })
  @Transform(strictInteger)
  @IsOptional()
  @IsInt()
  @Min(2007)
  @Max(2100)
  public releaseYear?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @Transform(strictInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  public storageCapacityGb?: number;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public colorName?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', example: '5000000' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(/^[0-9]+$/)
  public minPrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', example: '15000000' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(/^[0-9]+$/)
  public maxPrice?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(strictBoolean)
  @IsOptional()
  @IsBoolean()
  public inStock?: boolean;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  public page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;

  @ApiPropertyOptional({ type: String, enum: PRODUCT_SORT_FIELDS, default: 'createdAt' })
  @IsIn(PRODUCT_SORT_FIELDS)
  public sortBy: ProductSortField = 'createdAt';

  @ApiPropertyOptional({ type: String, enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: SortOrder = 'desc';
}

export class ProductSlugParamsDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 180, example: 'iphone-13' })
  @IsString()
  @Length(1, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  public slug!: string;
}

export class PublicUnitListQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 30, default: 24 })
  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(30)
  public limit = 24;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(strictBoolean)
  @IsBoolean()
  public featuredFirst = false;
}

export class UsedIphoneParamsDto extends ProductSlugParamsDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 64, example: 'IP13-MID-001' })
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  public inventoryCode!: string;
}
