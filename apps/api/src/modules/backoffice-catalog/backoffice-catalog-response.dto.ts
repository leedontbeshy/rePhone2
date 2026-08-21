import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CatalogStatus, InventoryMode, ProductType } from '../../generated/prisma/enums.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

const PRODUCT_TYPES = ['IPHONE', 'ACCESSORY'] as const;
const CATALOG_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const INVENTORY_MODES = ['SERIALIZED', 'QUANTITY'] as const;

export class BackofficeMediaSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public altText!: string | null;
  @ApiProperty({ type: Number }) public sortOrder!: number;
}

export class BackofficeVariantDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public productId!: string;
  @ApiProperty({ type: String }) public sku!: string;
  @ApiProperty({ type: String }) public displayName!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) public storageCapacityGb!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public colorName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public colorHex!: string | null;
  @ApiProperty({ enum: INVENTORY_MODES }) public inventoryMode!: InventoryMode;
  @ApiPropertyOptional({ type: String, nullable: true }) public salePrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public compareAtPrice!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) public accessoryAttributes!: unknown;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public warrantyPolicyId!: string | null;
  @ApiProperty({ enum: CATALOG_STATUSES }) public status!: CatalogStatus;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class BackofficeProductListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: PRODUCT_TYPES }) public type!: ProductType;
  @ApiProperty({ type: String }) public brand!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: String }) public slug!: string;
  @ApiProperty({ enum: CATALOG_STATUSES }) public status!: CatalogStatus;
  @ApiPropertyOptional({ type: Number, nullable: true }) public releaseYear!: number | null;
  @ApiProperty({ type: Number }) public variantCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class BackofficeProductDetailDto extends BackofficeProductListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) public description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public chipset!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) public ramGb!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public screenSizeInches!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public warrantyPolicyId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public seoTitle!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public seoDescription!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public archivedAt!: Date | null;
  @ApiProperty({ type: () => [BackofficeVariantDto] }) public variants!: BackofficeVariantDto[];
  @ApiProperty({ type: () => [BackofficeMediaSummaryDto] })
  public media!: BackofficeMediaSummaryDto[];
}

export class BackofficeProductListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class BackofficeProductListResponse {
  @ApiProperty({ type: () => [BackofficeProductListItemDto] })
  public data!: BackofficeProductListItemDto[];
  @ApiProperty({ type: () => BackofficeProductListMetaDto })
  public meta!: BackofficeProductListMetaDto;
}

export class BackofficeProductResponse {
  @ApiProperty({ type: () => BackofficeProductDetailDto }) public data!: BackofficeProductDetailDto;
}

export class BackofficeVariantResponse {
  @ApiProperty({ type: () => BackofficeVariantDto }) public data!: BackofficeVariantDto;
}
