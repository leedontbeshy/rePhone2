import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const WISHLIST_ITEM_TYPES = ['IPHONE', 'ACCESSORY'] as const;
export type WishlistItemType = (typeof WISHLIST_ITEM_TYPES)[number];

export class AddWishlistItemDto {
  @ApiProperty({ enum: WISHLIST_ITEM_TYPES })
  @IsIn(WISHLIST_ITEM_TYPES)
  public itemType!: WishlistItemType;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 64 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((input: AddWishlistItemDto) => input.itemType === 'IPHONE')
  @IsString()
  @Length(1, 64)
  public inventoryCode?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((input: AddWishlistItemDto) => input.itemType === 'ACCESSORY')
  @IsUUID()
  public variantId?: string;
}

export class WishlistItemParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public itemId!: string;
}
