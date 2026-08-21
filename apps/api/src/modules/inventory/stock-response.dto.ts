import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StockMovementType } from '../../generated/prisma/enums.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import { InventoryLocationDto, InventoryVariantSummaryDto } from './inventory-response.dto.js';

export class StockLevelDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: () => InventoryVariantSummaryDto })
  public variant!: InventoryVariantSummaryDto;
  @ApiProperty({ type: () => InventoryLocationDto }) public location!: InventoryLocationDto;
  @ApiProperty({ type: Number }) public quantityOnHand!: number;
  @ApiProperty({ type: Number }) public quantityReserved!: number;
  @ApiProperty({ type: Number }) public quantityAvailable!: number;
  @ApiProperty({ type: Number }) public reorderThreshold!: number;
  @ApiProperty({ type: Boolean }) public lowStock!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class StockMovementDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public variantId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public fromLocationId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public toLocationId!: string | null;
  @ApiProperty({
    enum: ['RECEIPT', 'SALE', 'RETURN', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WRITE_OFF'],
  })
  public type!: StockMovementType;
  @ApiProperty({ type: Number }) public quantity!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) public referenceType!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public referenceId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public reason!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public createdById!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class StockCommandResultDto {
  @ApiProperty({ type: () => StockMovementDto }) public movement!: StockMovementDto;
  @ApiProperty({ type: () => [StockLevelDto] }) public affectedLevels!: StockLevelDto[];
}

export class StockListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}
export class StockLevelListResponse {
  @ApiProperty({ type: () => [StockLevelDto] }) public data!: StockLevelDto[];
  @ApiProperty({ type: () => StockListMetaDto }) public meta!: StockListMetaDto;
}
export class StockMovementListResponse {
  @ApiProperty({ type: () => [StockMovementDto] }) public data!: StockMovementDto[];
  @ApiProperty({ type: () => StockListMetaDto }) public meta!: StockListMetaDto;
}
export class StockCommandResponse {
  @ApiProperty({ type: () => StockCommandResultDto }) public data!: StockCommandResultDto;
}
