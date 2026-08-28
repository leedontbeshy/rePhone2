import { Transform } from 'class-transformer';
import {
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

const PRODUCT_TYPES = ['IPHONE', 'ACCESSORY'] as const;
const CATALOG_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'releaseYear'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result.length === 0 ? undefined : result;
};
const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class ResourceIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class ProductVariantParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public productId!: string;
}

export class ArchiveReasonDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class CreateProductDto {
  @ApiProperty({ enum: PRODUCT_TYPES })
  @IsIn(PRODUCT_TYPES)
  public type!: (typeof PRODUCT_TYPES)[number];

  @ApiProperty({ type: String, maxLength: 255, default: 'Apple' })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public brand = 'Apple';

  @ApiProperty({ type: String, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public name!: string;

  @ApiProperty({ type: String, maxLength: 180, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  @Transform(trim)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(180)
  public slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  public description?: string;

  @ApiPropertyOptional({ type: Number, minimum: 2007, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(2007)
  @Max(2100)
  public releaseYear?: number;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public chipset?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 64 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  public ramGb?: number;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,2}(?:[.][0-9]{1,2})?$' })
  @IsOptional()
  @Matches(/^\d{1,2}(?:\.\d{1,2})?$/)
  public screenSizeInches?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public warrantyPolicyId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public seoTitle?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  public seoDescription?: string;
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['brand'] as const)) {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public brand?: string;
}

export class BackofficeProductListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(100)
  public q?: string;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  public type?: (typeof PRODUCT_TYPES)[number];

  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  public status?: (typeof CATALOG_STATUSES)[number];

  @ApiPropertyOptional({ type: Number, minimum: 2007, maximum: 2100 })
  @IsOptional()
  @Transform(queryInteger)
  @IsInt()
  @Min(2007)
  @Max(2100)
  public releaseYear?: number;

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

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'updatedAt' })
  @IsIn(SORT_FIELDS)
  public sortBy: (typeof SORT_FIELDS)[number] = 'updatedAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class CreateVariantDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  public sku!: string;

  @ApiProperty({ type: String, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public displayName!: string;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  public storageCapacityGb?: number;

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public colorName?: string | null;

  @ApiPropertyOptional({ type: String, pattern: '^#[0-9A-Fa-f]{6}$', nullable: true })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  public colorHex?: string | null;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$' })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public salePrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$', nullable: true })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public compareAtPrice?: string | null;

  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  @IsOptional()
  @IsObject()
  public accessoryAttributes?: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  public warrantyPolicyId?: string | null;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}
