import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PublicMediaDto } from '../catalog/catalog-response.dto.js';
import type { CommerceAvailability } from '../catalog/commerce-offer.reader.js';
import type { WishlistItemType } from './wishlist.dto.js';

export class WishlistTargetDto {
  @ApiProperty({ type: String, format: 'uuid' }) public productId!: string;
  @ApiProperty({ type: String }) public productSlug!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public variantId!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String }) public inventoryCode?: string;
}

export class WishlistMediaDto implements PublicMediaDto {
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ type: String }) public altText!: string;
  @ApiPropertyOptional({ type: Number }) public width?: number;
  @ApiPropertyOptional({ type: Number }) public height?: number;
}

export class WishlistItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] }) public itemType!: WishlistItemType;
  @ApiProperty({ type: () => WishlistTargetDto }) public target!: WishlistTargetDto;
  @ApiPropertyOptional({ type: () => WishlistMediaDto, nullable: true })
  public media!: WishlistMediaDto | null;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public currentUnitPrice!: string | null;
  @ApiProperty({ enum: ['AVAILABLE', 'OUT_OF_STOCK', 'RESERVED_OR_SOLD', 'INACTIVE'] })
  public availabilityStatus!: CommerceAvailability;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class WishlistItemResponse {
  @ApiProperty({ type: () => WishlistItemDto }) public data!: WishlistItemDto;
}

export class WishlistListResponse {
  @ApiProperty({ type: () => [WishlistItemDto] }) public data!: WishlistItemDto[];
}
