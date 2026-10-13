import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ActiveStatus,
  CatalogStatus,
  ConditionGrade,
  InspectionResult,
  InventoryLifecycleStatus,
  LocationType,
  SimConfiguration,
  SimLockStatus,
  BatteryReplacementStatus,
  InspectionStatus,
  InspectionType,
  RepairHistoryStatus,
} from '../../generated/prisma/enums.js';
import type { FunctionalCheckStatus } from '../../common/domain/iphone-inspection-checklist.js';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

const INVENTORY_UNIT_ACTIONS = [
  'CREATE_INSPECTION',
  'MAKE_AVAILABLE',
  'SEND_TO_REPAIR',
  'QUARANTINE',
  'WRITE_OFF',
  'TRANSFER',
  'UPLOAD_MEDIA',
] as const;

const AVAILABILITY_READINESS_REASONS = [
  'STATUS_NOT_INSPECTING',
  'INSPECTION_REQUIRED',
  'INSPECTION_NOT_PASSED',
  'ACTIVE_RESERVATION',
  'SALE_PRICE_REQUIRED',
  'LOCATION_INACTIVE',
  'VARIANT_INACTIVE',
  'PRODUCT_INACTIVE',
  'IDENTIFIER_REQUIRED',
  'MEDIA_REQUIRED',
] as const;

export type InventoryUnitAction = (typeof INVENTORY_UNIT_ACTIONS)[number];
export type AvailabilityReadinessReason = (typeof AVAILABILITY_READINESS_REASONS)[number];

export class InventoryProductSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: String }) public slug!: string;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] }) public status!: CatalogStatus;
}

export class InventoryVariantSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public sku!: string;
  @ApiProperty({ type: String }) public displayName!: string;
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] }) public status!: CatalogStatus;
}

export class InventoryLocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ enum: ['STORE', 'WAREHOUSE'] }) public type!: LocationType;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) public status!: ActiveStatus;
}

export class MaskedBackofficeIdentifierDto {
  @ApiProperty({ enum: ['IMEI_1', 'IMEI_2', 'SERIAL', 'EID'] })
  public type!: 'IMEI_1' | 'IMEI_2' | 'SERIAL' | 'EID';
  @ApiProperty({ type: String }) public maskedValue!: string;
}

export class CurrentInspectionSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['PASSED', 'PARTIAL', 'FAILED', 'INCOMPLETE'] })
  public overallResult!: InspectionResult;
  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], nullable: true })
  public conditionGrade!: ConditionGrade | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) public batteryHealthPercent!:
    number | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public inspectedAt!: Date | null;
}

export class InventoryUnitListItemDto {
  @ApiProperty({ type: Boolean }) public isFeatured!: boolean;
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public inventoryCode!: string;
  @ApiProperty({
    enum: [
      'RECEIVED',
      'INSPECTING',
      'AVAILABLE',
      'IN_TRANSIT',
      'SOLD',
      'REPAIRING',
      'QUARANTINED',
      'WRITTEN_OFF',
    ],
  })
  public lifecycleStatus!: InventoryLifecycleStatus;
  @ApiProperty({ type: () => InventoryProductSummaryDto })
  public product!: InventoryProductSummaryDto;
  @ApiProperty({ type: () => InventoryVariantSummaryDto })
  public variant!: InventoryVariantSummaryDto;
  @ApiProperty({ type: () => InventoryLocationDto }) public location!: InventoryLocationDto;
  @ApiPropertyOptional({ type: String, nullable: true }) public salePrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public compareAtPrice!: string | null;
  @ApiProperty({ enum: ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'] })
  public simLockStatus!: SimLockStatus;
  @ApiProperty({ type: () => [MaskedBackofficeIdentifierDto] })
  public maskedIdentifiers!: MaskedBackofficeIdentifierDto[];
  @ApiPropertyOptional({ type: () => CurrentInspectionSummaryDto, nullable: true })
  public currentInspection!: CurrentInspectionSummaryDto | null;
  @ApiProperty({ type: Number }) public activeReservationCount!: number;
  @ApiProperty({ type: Number }) public mediaCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) public receivedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class InventoryAvailabilityReadinessDto {
  @ApiProperty({ type: Boolean }) public isReady!: boolean;
  @ApiProperty({ enum: AVAILABILITY_READINESS_REASONS, isArray: true })
  public reasons!: AvailabilityReadinessReason[];
}

export class InventoryUnitDetailDto extends InventoryUnitListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) public modelNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public regionCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public carrierName!: string | null;
  @ApiProperty({
    enum: ['SINGLE_PHYSICAL', 'DUAL_PHYSICAL', 'PHYSICAL_AND_ESIM', 'ESIM_ONLY', 'UNKNOWN'],
  })
  public simConfiguration!: SimConfiguration;
  @ApiPropertyOptional({ type: Number, nullable: true }) public warrantyDaysOverride!:
    number | null;
  @ApiPropertyOptional({ type: () => [InventoryUnitMediaDto] })
  public media!: InventoryUnitMediaDto[];
  @ApiPropertyOptional({ enum: INVENTORY_UNIT_ACTIONS, isArray: true })
  public availableActions!: InventoryUnitAction[];
  @ApiPropertyOptional({ type: () => InventoryAvailabilityReadinessDto })
  public availabilityReadiness!: InventoryAvailabilityReadinessDto;
}

export class InventoryUnitMediaDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) public mimeType!: string;
  @ApiProperty({ type: Number }) public fileSize!: number;
  @ApiProperty({ type: Number }) public width!: number;
  @ApiProperty({ type: Number }) public height!: number;
  @ApiProperty({ type: Number }) public sortOrder!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) public altText!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
}

export class DecryptedIdentifiersDto {
  @ApiPropertyOptional({ type: String, nullable: true }) public imei1!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public imei2!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public serial!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public eid!: string | null;
}

export class InventoryCostDto {
  @ApiPropertyOptional({ type: String, nullable: true }) public acquisitionCost!: string | null;
  @ApiProperty({ type: String }) public additionalCost!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public totalCost!: string | null;
}

export class InventoryUnitListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}
export class InventoryUnitListResponse {
  @ApiProperty({ type: () => [InventoryUnitListItemDto] }) public data!: InventoryUnitListItemDto[];
  @ApiProperty({ type: () => InventoryUnitListMetaDto }) public meta!: InventoryUnitListMetaDto;
}
export class InventoryUnitResponse {
  @ApiProperty({ type: () => InventoryUnitDetailDto }) public data!: InventoryUnitDetailDto;
}
export class InventoryUnitListItemResponse {
  @ApiProperty({ type: () => InventoryUnitListItemDto }) public data!: InventoryUnitListItemDto;
}
export class DecryptedIdentifiersResponse {
  @ApiProperty({ type: () => DecryptedIdentifiersDto }) public data!: DecryptedIdentifiersDto;
}
export class InventoryCostResponse {
  @ApiProperty({ type: () => InventoryCostDto }) public data!: InventoryCostDto;
}
export class InventoryLocationListResponse {
  @ApiProperty({ type: () => [InventoryLocationDto] }) public data!: InventoryLocationDto[];
}

export class InspectionInspectorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class InspectionSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['INTAKE', 'RETURN', 'WARRANTY', 'PRE_SALE'] })
  public inspectionType!: InspectionType;
  @ApiProperty({ enum: ['DRAFT', 'COMPLETED'] }) public status!: InspectionStatus;
  @ApiProperty({ enum: ['INCOMPLETE', 'PASSED', 'PARTIAL', 'FAILED'] })
  public overallResult!: InspectionResult;
  @ApiProperty({ type: Boolean }) public isCurrent!: boolean;
  @ApiProperty({ type: String, format: 'uuid' }) public inspectorId!: string;
  @ApiPropertyOptional({ type: () => InspectionInspectorDto })
  public inspector!: InspectionInspectorDto;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public inspectedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class InspectionChecklistItemDto {
  @ApiProperty({ type: String }) public key!: string;
  @ApiProperty({ type: String }) public label!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public order!: number;
  @ApiPropertyOptional({
    enum: ['PASS', 'FAIL', 'DEGRADED', 'NOT_TESTED', 'NOT_APPLICABLE', 'UNKNOWN'],
    nullable: true,
  })
  public status!: FunctionalCheckStatus | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public note!: string | null;
}

export class InspectionChecklistProjectionDto {
  @ApiProperty({ type: Number, enum: [1] }) public schemaVersion!: 1;
  @ApiProperty({ type: () => [InspectionChecklistItemDto] })
  public items!: InspectionChecklistItemDto[];
}

export class InspectionDetailDto extends InspectionSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public inventoryUnitId!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) public batteryHealthPercent!:
    number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) public batteryCycleCount!: number | null;
  @ApiProperty({ enum: ['ORIGINAL', 'REPLACED', 'UNKNOWN'] })
  public batteryReplacementStatus!: BatteryReplacementStatus;
  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], nullable: true })
  public conditionGrade!: ConditionGrade | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public cosmeticNotes!: string | null;
  @ApiProperty({ type: Object }) public checks!: unknown;
  @ApiPropertyOptional({ type: () => InspectionChecklistProjectionDto })
  public checklist!: InspectionChecklistProjectionDto;
  @ApiProperty({ enum: ['NONE_KNOWN', 'KNOWN', 'UNKNOWN'] })
  public repairHistoryStatus!: RepairHistoryStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) public repairNotes!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) public replacedParts!: unknown;
}

export class InspectionListResponse {
  @ApiProperty({ type: () => [InspectionSummaryDto] }) public data!: InspectionSummaryDto[];
  @ApiProperty({ type: () => InventoryUnitListMetaDto }) public meta!: InventoryUnitListMetaDto;
}
export class InspectionResponse {
  @ApiProperty({ type: () => InspectionDetailDto }) public data!: InspectionDetailDto;
}
