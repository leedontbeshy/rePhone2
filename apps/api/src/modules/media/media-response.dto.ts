import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductMediaDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['PRODUCT', 'VARIANT', 'INVENTORY_UNIT'] })
  public ownerType!: 'PRODUCT' | 'VARIANT' | 'INVENTORY_UNIT';
  @ApiProperty({ type: String, format: 'uuid' }) public ownerId!: string;
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) public mimeType!: string;
  @ApiProperty({ type: Number }) public fileSize!: number;
  @ApiProperty({ type: Number }) public width!: number;
  @ApiProperty({ type: Number }) public height!: number;
  @ApiProperty({ type: Number }) public sortOrder!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) public altText!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class ProductMediaResponse {
  @ApiProperty({ type: () => ProductMediaDto }) public data!: ProductMediaDto;
}
