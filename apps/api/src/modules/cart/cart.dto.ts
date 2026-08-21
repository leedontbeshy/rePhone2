import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CART_ITEM_TYPES = ['IPHONE', 'ACCESSORY'] as const;
export type CartItemType = (typeof CART_ITEM_TYPES)[number];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AddCartItemDto {
  @ApiProperty({ enum: CART_ITEM_TYPES })
  @IsIn(CART_ITEM_TYPES)
  public itemType!: CartItemType;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 64 })
  @Transform(trim)
  @ValidateIf((input: AddCartItemDto) => input.itemType === 'IPHONE')
  @IsString()
  @Length(1, 64)
  public inventoryCode?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((input: AddCartItemDto) => input.itemType === 'ACCESSORY')
  @IsUUID()
  public variantId?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 99 })
  @ValidateIf((input: AddCartItemDto) => input.itemType === 'ACCESSORY')
  @IsInt()
  @Min(1)
  @Max(99)
  public quantity?: number;
}

export class AddIphoneCartItemDto {
  @ApiProperty({ enum: ['IPHONE'] }) public itemType!: 'IPHONE';
  @ApiProperty({ type: String, minLength: 1, maxLength: 64 }) public inventoryCode!: string;
}

export class AddAccessoryCartItemDto {
  @ApiProperty({ enum: ['ACCESSORY'] }) public itemType!: 'ACCESSORY';
  @ApiProperty({ type: String, format: 'uuid' }) public variantId!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 99 }) public quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  public quantity!: number;
}

export class CartItemParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public itemId!: string;
}
