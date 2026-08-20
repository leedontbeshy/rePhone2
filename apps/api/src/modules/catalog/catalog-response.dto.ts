import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import type {
  BatteryReplacementStatus,
  ConditionGrade,
  ProductType,
  RepairHistoryStatus,
  SimConfiguration,
  SimLockStatus,
} from '../../generated/prisma/enums.js';

const PRODUCT_TYPES = ['IPHONE', 'ACCESSORY'] as const;
const SIM_LOCK_STATUSES = ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'] as const;
const SIM_CONFIGURATIONS = [
  'SINGLE_PHYSICAL',
  'DUAL_PHYSICAL',
  'PHYSICAL_AND_ESIM',
  'ESIM_ONLY',
  'UNKNOWN',
] as const;
const CONDITION_GRADES = ['A', 'B', 'C'] as const;
const BATTERY_REPLACEMENT_STATUSES = ['ORIGINAL', 'REPLACED', 'UNKNOWN'] as const;
const REPAIR_HISTORY_STATUSES = ['NONE_KNOWN', 'KNOWN', 'UNKNOWN'] as const;
const CHECK_STATUSES = [
  'PASS',
  'FAIL',
  'DEGRADED',
  'NOT_TESTED',
  'NOT_APPLICABLE',
  'UNKNOWN',
] as const;
const IDENTIFIER_TYPES = ['IMEI_1', 'IMEI_2', 'SERIAL', 'EID'] as const;

export type FunctionalCheckStatus = (typeof CHECK_STATUSES)[number];
export type MaskedIdentifierType = (typeof IDENTIFIER_TYPES)[number];

export class PublicMediaDto {
  @ApiProperty({ type: String, format: 'uri' })
  public url!: string;

  @ApiProperty({ type: String })
  public altText!: string;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  public width?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  public height?: number;
}

export class ProductPriceRangeDto {
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', example: '12500000' })
  public fromPrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', example: '13900000' })
  public compareAtPrice?: string;
}

export class UnitPriceDto {
  @ApiProperty({ type: String, pattern: '^[0-9]+$', example: '12500000' })
  public salePrice!: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', example: '13900000' })
  public compareAtPrice?: string;
}

export class ProductListItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String, enum: PRODUCT_TYPES })
  public productType!: ProductType;

  @ApiProperty({ type: String })
  public brand!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  public releaseYear!: number | null;

  @ApiPropertyOptional({ type: () => PublicMediaDto })
  public coverMedia?: PublicMediaDto;

  @ApiProperty({ type: () => ProductPriceRangeDto })
  public price!: ProductPriceRangeDto;

  @ApiProperty({ type: Boolean })
  public inStock!: boolean;

  @ApiProperty({ type: [Number] })
  public storageOptions!: number[];

  @ApiProperty({ type: [String] })
  public colorOptions!: string[];
}

export class PaginationDto {
  @ApiProperty({ type: Number, minimum: 1 })
  public page!: number;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100 })
  public pageSize!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public totalItems!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public totalPages!: number;
}

export class ProductListMetaDto {
  @ApiProperty({ type: () => PaginationDto })
  public pagination!: PaginationDto;
}

export class ProductListResponse {
  @ApiProperty({ type: () => [ProductListItemDto] })
  public data!: ProductListItemDto[];

  @ApiProperty({ type: () => ProductListMetaDto })
  public meta!: ProductListMetaDto;
}

export class WarrantySummaryDto {
  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  public days!: number;

  @ApiProperty({ type: String })
  public terms!: string;
}

export class FulfillmentAvailabilityDto {
  @ApiProperty({ type: Boolean })
  public pickup!: boolean;

  @ApiProperty({ type: Boolean })
  public shipping!: boolean;
}

export class AccessoryFulfillmentAvailabilityDto extends FulfillmentAvailabilityDto {
  @ApiProperty({ type: Boolean })
  public inStock!: boolean;
}

export class UsedIphoneCardDto {
  @ApiProperty({ type: String })
  public inventoryCode!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public modelNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public regionCode!: string | null;

  @ApiProperty({ type: String, enum: SIM_LOCK_STATUSES })
  public simLockStatus!: SimLockStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  public carrierName!: string | null;

  @ApiProperty({ type: String, enum: SIM_CONFIGURATIONS })
  public simConfiguration!: SimConfiguration;

  @ApiProperty({ type: () => UnitPriceDto })
  public price!: UnitPriceDto;

  @ApiProperty({ type: String, enum: CONDITION_GRADES })
  public conditionGrade!: ConditionGrade;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100, nullable: true })
  public batteryHealthPercent!: number | null;

  @ApiProperty({ type: String, enum: REPAIR_HISTORY_STATUSES })
  public repairHistoryStatus!: RepairHistoryStatus;

  @ApiProperty({ type: Number, minimum: 0 })
  public warrantyDays!: number;

  @ApiPropertyOptional({ type: () => PublicMediaDto })
  public thumbnail?: PublicMediaDto;

  @ApiProperty({ type: () => FulfillmentAvailabilityDto })
  public fulfillmentAvailability!: FulfillmentAvailabilityDto;
}

export class IphoneVariantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: String })
  public displayName!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  public storageCapacityGb!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorHex!: string | null;

  @ApiProperty({ type: () => WarrantySummaryDto })
  public warrantySummary!: WarrantySummaryDto;

  @ApiProperty({ type: () => [UsedIphoneCardDto] })
  public availableUnits!: UsedIphoneCardDto[];
}

export class AccessoryVariantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: String })
  public displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorHex!: string | null;

  @ApiProperty({ type: () => UnitPriceDto })
  public price!: UnitPriceDto;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  public attributes!: Record<string, unknown> | null;

  @ApiProperty({ type: () => WarrantySummaryDto })
  public warrantySummary!: WarrantySummaryDto;

  @ApiProperty({ type: () => [PublicMediaDto] })
  public media!: PublicMediaDto[];

  @ApiProperty({ type: () => AccessoryFulfillmentAvailabilityDto })
  public fulfillmentAvailability!: AccessoryFulfillmentAvailabilityDto;
}

export class ProductDetailDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String, enum: PRODUCT_TYPES })
  public productType!: ProductType;

  @ApiProperty({ type: String })
  public brand!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public description!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  public releaseYear!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public chipset!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  public ramGb!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '6.10' })
  public screenSizeInches!: string | null;

  @ApiProperty({ type: () => [PublicMediaDto] })
  public media!: PublicMediaDto[];

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(IphoneVariantDto) },
        { $ref: getSchemaPath(AccessoryVariantDto) },
      ],
    },
  })
  public variants!: Array<IphoneVariantDto | AccessoryVariantDto>;
}

export class ProductDetailResponse {
  @ApiProperty({ type: () => ProductDetailDto })
  public data!: ProductDetailDto;
}

export class UsedIphoneProductSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public brand!: string;
}

export class UsedIphoneVariantSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: String })
  public displayName!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  public storageCapacityGb!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public colorHex!: string | null;
}

export class FunctionalCheckDto {
  @ApiProperty({ type: String })
  public key!: string;

  @ApiProperty({ type: String })
  public label!: string;

  @ApiProperty({ type: String, enum: CHECK_STATUSES })
  public status!: FunctionalCheckStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  public note?: string | null;
}

export class MaskedIdentifierDto {
  @ApiProperty({ type: String, enum: IDENTIFIER_TYPES })
  public type!: MaskedIdentifierType;

  @ApiProperty({ type: String, example: '•••• 1234' })
  public maskedValue!: string;
}

export class UsedIphoneUnitDto {
  @ApiProperty({ type: String })
  public inventoryCode!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public modelNumber!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  public regionCode!: string | null;

  @ApiProperty({ type: String, enum: SIM_LOCK_STATUSES })
  public simLockStatus!: SimLockStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  public carrierName!: string | null;

  @ApiProperty({ type: String, enum: SIM_CONFIGURATIONS })
  public simConfiguration!: SimConfiguration;

  @ApiProperty({ type: () => UnitPriceDto })
  public price!: UnitPriceDto;

  @ApiProperty({ type: String, enum: CONDITION_GRADES })
  public conditionGrade!: ConditionGrade;

  @ApiPropertyOptional({ type: String, nullable: true })
  public cosmeticNotes!: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100, nullable: true })
  public batteryHealthPercent!: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  public batteryCycleCount!: number | null;

  @ApiProperty({ type: String, enum: BATTERY_REPLACEMENT_STATUSES })
  public batteryReplacementStatus!: BatteryReplacementStatus;

  @ApiProperty({ type: String, enum: REPAIR_HISTORY_STATUSES })
  public repairHistoryStatus!: RepairHistoryStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  public repairNotes!: string | null;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  public replacedParts!: unknown;

  @ApiProperty({ type: () => [FunctionalCheckDto] })
  public functionalChecks!: FunctionalCheckDto[];

  @ApiProperty({ type: () => [MaskedIdentifierDto] })
  public maskedIdentifiers!: MaskedIdentifierDto[];

  @ApiProperty({ type: Number, minimum: 0 })
  public warrantyDays!: number;

  @ApiProperty({ type: () => FulfillmentAvailabilityDto })
  public fulfillmentAvailability!: FulfillmentAvailabilityDto;

  @ApiProperty({ type: () => [PublicMediaDto] })
  public media!: PublicMediaDto[];
}

export class UsedIphoneDetailDto {
  @ApiProperty({ type: () => UsedIphoneProductSummaryDto })
  public product!: UsedIphoneProductSummaryDto;

  @ApiProperty({ type: () => UsedIphoneVariantSummaryDto })
  public variant!: UsedIphoneVariantSummaryDto;

  @ApiProperty({ type: () => UsedIphoneUnitDto })
  public unit!: UsedIphoneUnitDto;
}

export class UsedIphoneDetailResponse {
  @ApiProperty({ type: () => UsedIphoneDetailDto })
  public data!: UsedIphoneDetailDto;
}
