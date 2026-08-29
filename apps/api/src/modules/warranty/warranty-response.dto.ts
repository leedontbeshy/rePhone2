import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PolicyStatus, WarrantyStatus } from '../../generated/prisma/enums.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import {
  BACKOFFICE_WARRANTY_ACTIONS,
  BACKOFFICE_WARRANTY_POLICY_ACTIONS,
  WARRANTY_POLICY_ARCHIVE_BLOCKED_REASONS,
  type BackofficeWarrantyAction,
  type BackofficeWarrantyPolicyAction,
  type WarrantyPolicyArchiveBlockedReason,
} from './warranty-actions.js';

export class WarrantyListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class WarrantyPolicyDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 3650 }) public defaultDays!: number;
  @ApiProperty({ type: String }) public terms!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) public status!: PolicyStatus;
  @ApiProperty({ type: Boolean }) public isArchived!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public archivedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class WarrantyPolicyResponse {
  @ApiProperty({ type: () => WarrantyPolicyDto }) public data!: WarrantyPolicyDto;
}

export class BackofficeWarrantyPolicyDetailDto extends WarrantyPolicyDto {
  @ApiProperty({ type: [String], enum: BACKOFFICE_WARRANTY_POLICY_ACTIONS })
  public availableActions!: BackofficeWarrantyPolicyAction[];
  @ApiProperty({ enum: WARRANTY_POLICY_ARCHIVE_BLOCKED_REASONS, nullable: true })
  public archiveBlockedReason!: WarrantyPolicyArchiveBlockedReason | null;
}

export class BackofficeWarrantyPolicyDetailResponse {
  @ApiProperty({ type: () => BackofficeWarrantyPolicyDetailDto })
  public data!: BackofficeWarrantyPolicyDetailDto;
}

export class WarrantyPolicyListResponse {
  @ApiProperty({ type: () => [WarrantyPolicyDto] }) public data!: WarrantyPolicyDto[];
  @ApiProperty({ type: () => WarrantyListMetaDto }) public meta!: WarrantyListMetaDto;
}

export class WarrantyListItemDto {
  @ApiProperty({ type: String }) public warrantyCode!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public orderItemId!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
  @ApiProperty({ type: Number, minimum: 1 }) public daysSnapshot!: number;
  @ApiProperty({ enum: ['ACTIVE', 'VOIDED'] }) public status!: WarrantyStatus;
  @ApiProperty({ type: String, format: 'date-time' }) public startAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public endAt!: Date;
  @ApiProperty({ type: Boolean }) public isValid!: boolean;
  @ApiProperty({ type: Boolean }) public isExpired!: boolean;
}

export class WarrantyDetailDto extends WarrantyListItemDto {
  @ApiProperty({ type: String }) public sku!: string;
  @ApiProperty({ type: String }) public termsSnapshot!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  public maskedIdentifierSuffix!: string | null;
}

export class WarrantyListResponse {
  @ApiProperty({ type: () => [WarrantyListItemDto] }) public data!: WarrantyListItemDto[];
  @ApiProperty({ type: () => WarrantyListMetaDto }) public meta!: WarrantyListMetaDto;
}

export class WarrantyDetailResponse {
  @ApiProperty({ type: () => WarrantyDetailDto }) public data!: WarrantyDetailDto;
}

export class WarrantyCustomerSummaryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public customerId!: string | null;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ type: String }) public phone!: string;
}

export class WarrantyPolicySummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
}

export class WarrantyActorSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
}

export class BackofficeWarrantyListItemDto extends WarrantyListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: () => WarrantyCustomerSummaryDto })
  public customer!: WarrantyCustomerSummaryDto;
  @ApiPropertyOptional({ type: () => WarrantyPolicySummaryDto, nullable: true })
  public policy!: WarrantyPolicySummaryDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class BackofficeWarrantyDetailDto extends BackofficeWarrantyListItemDto {
  @ApiProperty({ type: String }) public sku!: string;
  @ApiProperty({ type: String }) public termsSnapshot!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  public maskedIdentifierSuffix!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public voidReason!: string | null;
  @ApiPropertyOptional({ type: () => WarrantyActorSummaryDto, nullable: true })
  public voidedBy!: WarrantyActorSummaryDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public voidedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
  @ApiProperty({ type: [String], enum: BACKOFFICE_WARRANTY_ACTIONS })
  public availableActions!: BackofficeWarrantyAction[];
}

export class BackofficeWarrantyListResponse {
  @ApiProperty({ type: () => [BackofficeWarrantyListItemDto] })
  public data!: BackofficeWarrantyListItemDto[];
  @ApiProperty({ type: () => WarrantyListMetaDto }) public meta!: WarrantyListMetaDto;
}

export class BackofficeWarrantyDetailResponse {
  @ApiProperty({ type: () => BackofficeWarrantyDetailDto })
  public data!: BackofficeWarrantyDetailDto;
}
