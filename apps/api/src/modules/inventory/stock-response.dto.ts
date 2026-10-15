import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StockMovementType } from '../../generated/prisma/enums.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import {
  InventoryLocationDto,
  InventoryProductSummaryDto,
  InventoryVariantSummaryDto,
} from './inventory-response.dto.js';

export class StockActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class StockVariantDto extends InventoryVariantSummaryDto {
  @ApiProperty({ type: () => InventoryProductSummaryDto })
  public product!: InventoryProductSummaryDto;
}

export class StockLevelDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiPropertyOptional({ type: () => InventoryProductSummaryDto })
  public product!: InventoryProductSummaryDto;
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
  @ApiPropertyOptional({ type: () => InventoryProductSummaryDto })
  public product!: InventoryProductSummaryDto;
  @ApiPropertyOptional({ type: () => InventoryVariantSummaryDto })
  public variant!: InventoryVariantSummaryDto;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public fromLocationId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public toLocationId!: string | null;
  @ApiPropertyOptional({ type: () => InventoryLocationDto, nullable: true })
  public fromLocation!: InventoryLocationDto | null;
  @ApiPropertyOptional({ type: () => InventoryLocationDto, nullable: true })
  public toLocation!: InventoryLocationDto | null;
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
  @ApiPropertyOptional({ type: () => StockActorDto, nullable: true })
  public createdBy!: StockActorDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class StockCommandResultDto {
  @ApiProperty({ type: () => StockMovementDto }) public movement!: StockMovementDto;
  @ApiProperty({ type: () => [StockLevelDto] }) public affectedLevels!: StockLevelDto[];
}

export class StockListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}
export class StockVariantListResponse {
  @ApiProperty({ type: () => [StockVariantDto] }) public data!: StockVariantDto[];
  @ApiProperty({ type: () => StockListMetaDto }) public meta!: StockListMetaDto;
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
