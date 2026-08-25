import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import {
  AFTER_SALES_RESOLUTIONS,
  AFTER_SALES_STATUSES,
  AFTER_SALES_TYPES,
  CUSTOMER_AFTER_SALES_ACTIONS,
  type AfterSalesResolution,
  type AfterSalesStatus,
  type AfterSalesType,
  type CustomerAfterSalesAction,
} from './after-sales-policy.js';

export class AfterSalesOrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
  @ApiProperty({ type: Number, minimum: 1 }) public quantity!: number;
}

export class AfterSalesWarrantySummaryDto {
  @ApiProperty({ type: String }) public warrantyCode!: string;
  @ApiProperty({ enum: ['ACTIVE', 'VOIDED'] }) public status!: 'ACTIVE' | 'VOIDED';
  @ApiProperty({ type: String, format: 'date-time' }) public startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public endAt!: string;
  @ApiProperty({ type: Boolean }) public isValid!: boolean;
  @ApiProperty({ type: Boolean }) public isExpired!: boolean;
}

export class AfterSalesAttachmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({
    enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  })
  public mimeType!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 10 * 1024 * 1024 })
  public fileSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) public uploadedAt!: string;
}

export class AfterSalesListItemDto {
  @ApiProperty({ type: String }) public requestNumber!: string;
  @ApiProperty({ enum: AFTER_SALES_TYPES }) public type!: AfterSalesType;
  @ApiProperty({ enum: AFTER_SALES_STATUSES }) public status!: AfterSalesStatus;
  @ApiProperty({ type: () => AfterSalesOrderItemDto }) public orderItem!: AfterSalesOrderItemDto;
  @ApiProperty({ type: String }) public issueDescription!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public requestedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: string;
}

export class AfterSalesTimelineDto {
  @ApiProperty({ type: String, format: 'date-time' }) public requestedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public receivedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public inspectedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public decidedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public resolvedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public returnedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public cancelledAt!: string | null;
}

export class AfterSalesDetailDto extends AfterSalesListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  public requestedResolution!: string | null;
  @ApiPropertyOptional({ type: () => AfterSalesWarrantySummaryDto, nullable: true })
  public warranty!: AfterSalesWarrantySummaryDto | null;
  @ApiProperty({ type: () => [AfterSalesAttachmentDto] })
  public attachments!: AfterSalesAttachmentDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) public decisionNote!: string | null;
  @ApiPropertyOptional({ enum: AFTER_SALES_RESOLUTIONS, nullable: true })
  public resolutionType!: AfterSalesResolution | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public resolutionNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public cancelReason!: string | null;
  @ApiProperty({ type: () => AfterSalesTimelineDto }) public timeline!: AfterSalesTimelineDto;
  @ApiProperty({ type: [String], enum: CUSTOMER_AFTER_SALES_ACTIONS })
  public availableActions!: CustomerAfterSalesAction[];
}

export class AfterSalesAttachmentCollectionDto {
  @ApiProperty({ type: String }) public requestNumber!: string;
  @ApiProperty({ type: () => [AfterSalesAttachmentDto] })
  public attachments!: AfterSalesAttachmentDto[];
}

export class AfterSalesAttachmentUrlDto {
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public expiresAt!: string;
}

export class AfterSalesListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class AfterSalesListResponse {
  @ApiProperty({ type: () => [AfterSalesListItemDto] }) public data!: AfterSalesListItemDto[];
  @ApiProperty({ type: () => AfterSalesListMetaDto }) public meta!: AfterSalesListMetaDto;
}

export class AfterSalesDetailResponse {
  @ApiProperty({ type: () => AfterSalesDetailDto }) public data!: AfterSalesDetailDto;
}

export class AfterSalesAttachmentCollectionResponse {
  @ApiProperty({ type: () => AfterSalesAttachmentCollectionDto })
  public data!: AfterSalesAttachmentCollectionDto;
}

export class AfterSalesAttachmentUrlResponse {
  @ApiProperty({ type: () => AfterSalesAttachmentUrlDto }) public data!: AfterSalesAttachmentUrlDto;
}
