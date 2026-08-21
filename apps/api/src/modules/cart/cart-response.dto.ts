import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CartStatus } from '../../generated/prisma/enums.js';
import type { PublicMediaDto } from '../catalog/catalog-response.dto.js';
import type { CommerceAvailability } from '../catalog/commerce-offer.reader.js';
import type { CartItemType } from './cart.dto.js';

export const CART_WARNINGS = [
  'PRICE_CHANGED',
  'QUANTITY_NOT_AVAILABLE',
  'ITEM_UNAVAILABLE',
  'QUANTITY_CAPPED_ON_MERGE',
] as const;
export type CartWarning = (typeof CART_WARNINGS)[number];

export class CartTargetDto {
  @ApiProperty({ type: String, format: 'uuid' }) public productId!: string;
  @ApiProperty({ type: String }) public productSlug!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public variantId!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String }) public inventoryCode?: string;
}

export class CartMediaDto implements PublicMediaDto {
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ type: String }) public altText!: string;
  @ApiPropertyOptional({ type: Number }) public width?: number;
  @ApiPropertyOptional({ type: Number }) public height?: number;
}

export class CartItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] }) public itemType!: CartItemType;
  @ApiProperty({ type: Number, minimum: 1, maximum: 99 }) public quantity!: number;
  @ApiProperty({ type: () => CartTargetDto }) public target!: CartTargetDto;
  @ApiPropertyOptional({ type: () => CartMediaDto, nullable: true })
  public media!: CartMediaDto | null;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public priceAtAddition!: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public currentUnitPrice!: string | null;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public estimatedLineTotal!: string | null;
  @ApiProperty({ enum: ['AVAILABLE', 'OUT_OF_STOCK', 'RESERVED_OR_SOLD', 'INACTIVE'] })
  public availabilityStatus!: CommerceAvailability;
  @ApiProperty({ type: [String], enum: CART_WARNINGS }) public warnings!: CartWarning[];
}

export class CartDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) public id!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED'] })
  public status!: CartStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public expiresAt!: Date | null;
  @ApiProperty({ type: () => [CartItemDto] }) public items!: CartItemDto[];
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public estimatedSubtotal!: string;
  @ApiProperty({ type: [String], enum: CART_WARNINGS }) public warnings!: CartWarning[];
}

export class CartResponse {
  @ApiProperty({ type: () => CartDto }) public data!: CartDto;
}
