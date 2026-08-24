import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import {
  AFTER_SALES_RESOLUTIONS,
  BACKOFFICE_AFTER_SALES_ACTIONS,
  type AfterSalesResolution,
  type BackofficeAfterSalesAction,
} from './after-sales-policy.js';
import {
  AfterSalesAttachmentDto,
  AfterSalesListItemDto,
  AfterSalesTimelineDto,
  AfterSalesWarrantySummaryDto,
} from './after-sales-response.dto.js';

export class AfterSalesActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
}

export class AfterSalesCustomerDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public id!: string | null;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ type: String }) public phone!: string;
}

export class AfterSalesLocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ enum: ['STORE', 'WAREHOUSE'] }) public type!: 'STORE' | 'WAREHOUSE';
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) public status!: 'ACTIVE' | 'INACTIVE';
}

export class AfterSalesInspectionDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['PRE_SALE', 'RETURN', 'WARRANTY'] }) public type!: string;
  @ApiProperty({ enum: ['DRAFT', 'COMPLETED'] }) public status!: string;
  @ApiProperty({ type: String }) public overallResult!: string;
  @ApiPropertyOptional({ type: () => AfterSalesActorDto, nullable: true })
  public inspector!: AfterSalesActorDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public inspectedAt!: string | null;
}

export class AfterSalesRefundDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public amount!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] }) public method!: string;
  @ApiProperty({ enum: ['REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED'] })
  public status!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public completedAt!: string | null;
}

export class AfterSalesReplacementUnitDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public inventoryCode!: string;
  @ApiProperty({ type: String }) public lifecycleStatus!: string;
}

export class BackofficeAfterSalesListItemDto extends AfterSalesListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: () => AfterSalesCustomerDto }) public customer!: AfterSalesCustomerDto;
  @ApiPropertyOptional({ type: () => AfterSalesActorDto, nullable: true })
  public assignedTo!: AfterSalesActorDto | null;
  @ApiProperty({ type: Number, minimum: 0, maximum: 5 }) public attachmentCount!: number;
}

export class BackofficeAfterSalesDetailDto extends BackofficeAfterSalesListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  public requestedResolution!: string | null;
  @ApiPropertyOptional({ type: () => AfterSalesWarrantySummaryDto, nullable: true })
  public warranty!: AfterSalesWarrantySummaryDto | null;
  @ApiPropertyOptional({ type: () => AfterSalesLocationDto, nullable: true })
  public receivedLocation!: AfterSalesLocationDto | null;
  @ApiPropertyOptional({ type: () => AfterSalesActorDto, nullable: true })
  public receivedBy!: AfterSalesActorDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public receiveNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  public inspectionSummary!: string | null;
  @ApiPropertyOptional({ type: () => AfterSalesInspectionDto, nullable: true })
  public inspection!: AfterSalesInspectionDto | null;
  @ApiPropertyOptional({ type: () => AfterSalesActorDto, nullable: true })
  public decidedBy!: AfterSalesActorDto | null;
  @ApiPropertyOptional({ type: () => AfterSalesActorDto, nullable: true })
  public resolvedBy!: AfterSalesActorDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public returnNote!: string | null;
  @ApiPropertyOptional({ type: () => AfterSalesRefundDto, nullable: true })
  public refund!: AfterSalesRefundDto | null;
  @ApiPropertyOptional({ type: () => AfterSalesReplacementUnitDto, nullable: true })
  public replacementUnit!: AfterSalesReplacementUnitDto | null;
  @ApiProperty({ type: () => [AfterSalesAttachmentDto] })
  public attachments!: AfterSalesAttachmentDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) public decisionNote!: string | null;
  @ApiPropertyOptional({ enum: AFTER_SALES_RESOLUTIONS, nullable: true })
  public resolutionType!: AfterSalesResolution | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public resolutionNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public cancelReason!: string | null;
  @ApiProperty({ type: () => AfterSalesTimelineDto }) public timeline!: AfterSalesTimelineDto;
  @ApiProperty({ type: [String], enum: BACKOFFICE_AFTER_SALES_ACTIONS })
  public availableActions!: BackofficeAfterSalesAction[];
}

export class BackofficeAfterSalesListResponse {
  @ApiProperty({ type: () => [BackofficeAfterSalesListItemDto] })
  public data!: BackofficeAfterSalesListItemDto[];
  @ApiProperty({ type: () => PaginationDto }) public meta!: { pagination: PaginationDto };
}

export class BackofficeAfterSalesDetailResponse {
  @ApiProperty({ type: () => BackofficeAfterSalesDetailDto })
  public data!: BackofficeAfterSalesDetailDto;
}
