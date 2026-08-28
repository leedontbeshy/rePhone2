import { Transform } from 'class-transformer';
import {
  Allow,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SIM_LOCK_STATUSES = ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'] as const;
const SIM_CONFIGURATIONS = [
  'SINGLE_PHYSICAL',
  'DUAL_PHYSICAL',
  'PHYSICAL_AND_ESIM',
  'ESIM_ONLY',
  'UNKNOWN',
] as const;
const LIFECYCLE_STATUSES = [
  'RECEIVED',
  'INSPECTING',
  'AVAILABLE',
  'IN_TRANSIT',
  'SOLD',
  'REPAIRING',
  'QUARANTINED',
  'WRITTEN_OFF',
] as const;
const CONDITION_GRADES = ['A', 'B', 'C'] as const;
const IDENTIFIER_TYPES = ['IMEI', 'SERIAL', 'EID'] as const;
const SORT_FIELDS = ['receivedAt', 'updatedAt', 'inventoryCode', 'salePrice'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result.length === 0 ? undefined : result;
};
const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class InventoryResourceIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class InventoryReasonDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class InventoryUnitListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(100)
  public q?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public productId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public variantId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public locationId?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_STATUSES })
  @IsOptional()
  @IsIn(LIFECYCLE_STATUSES)
  public lifecycleStatus?: (typeof LIFECYCLE_STATUSES)[number];

  @ApiPropertyOptional({ enum: CONDITION_GRADES })
  @IsOptional()
  @IsIn(CONDITION_GRADES)
  public conditionGrade?: (typeof CONDITION_GRADES)[number];

  @ApiPropertyOptional({ enum: SIM_LOCK_STATUSES })
  @IsOptional()
  @IsIn(SIM_LOCK_STATUSES)
  public simLockStatus?: (typeof SIM_LOCK_STATUSES)[number];

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100 })
  @IsOptional()
  @Transform(queryInteger)
  @IsInt()
  @Min(0)
  @Max(100)
  public minBatteryHealth?: number;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'receivedAt' })
  @IsIn(SORT_FIELDS)
  public sortBy: (typeof SORT_FIELDS)[number] = 'receivedAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class IntakeInventoryUnitDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public variantId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public locationId!: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public modelNumber?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public regionCode?: string;

  @ApiProperty({ enum: SIM_LOCK_STATUSES })
  @IsIn(SIM_LOCK_STATUSES)
  public simLockStatus!: (typeof SIM_LOCK_STATUSES)[number];

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public carrierName?: string | null;

  @ApiProperty({ enum: SIM_CONFIGURATIONS })
  @IsIn(SIM_CONFIGURATIONS)
  public simConfiguration!: (typeof SIM_CONFIGURATIONS)[number];

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public imei1?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public imei2?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public serial?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public eid?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$' })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public salePrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$' })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public compareAtPrice?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  public warrantyDaysOverride?: number;
}

export class UpdateInventoryUnitDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public modelNumber?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public regionCode?: string;

  @ApiPropertyOptional({ enum: SIM_LOCK_STATUSES })
  @IsOptional()
  @IsIn(SIM_LOCK_STATUSES)
  public simLockStatus?: (typeof SIM_LOCK_STATUSES)[number];

  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public carrierName?: string | null;

  @ApiPropertyOptional({ enum: SIM_CONFIGURATIONS })
  @IsOptional()
  @IsIn(SIM_CONFIGURATIONS)
  public simConfiguration?: (typeof SIM_CONFIGURATIONS)[number];

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public imei1?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public imei2?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public serial?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() public eid?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$' })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public salePrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$' })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public compareAtPrice?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  public warrantyDaysOverride?: number;

  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason?: string;
}

export class IdentifierLookupDto extends InventoryReasonDto {
  @ApiProperty({ enum: IDENTIFIER_TYPES })
  @IsIn(IDENTIFIER_TYPES)
  public type!: (typeof IDENTIFIER_TYPES)[number];

  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 100)
  public value!: string;
}

export class UpdateInventoryCostDto extends InventoryReasonDto {
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,15}$', nullable: true })
  @IsOptional()
  @Matches(/^\d{1,15}$/)
  public acquisitionCost?: string | null;

  @ApiProperty({ type: String, pattern: '^[0-9]{1,15}$' })
  @Matches(/^\d{1,15}$/)
  public additionalCost!: string;
}

export class TransferInventoryUnitDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public toLocationId!: string;

  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 500)
  public reason?: string;
}

export class InspectionListQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;
}

export class CreateInspectionDto {
  @ApiProperty({ enum: ['INTAKE', 'RETURN', 'WARRANTY', 'PRE_SALE'] })
  @IsIn(['INTAKE', 'RETURN', 'WARRANTY', 'PRE_SALE'])
  public inspectionType!: 'INTAKE' | 'RETURN' | 'WARRANTY' | 'PRE_SALE';
}

export class UpdateInspectionDto {
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  public batteryHealthPercent?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  public batteryCycleCount?: number;

  @ApiPropertyOptional({ enum: ['ORIGINAL', 'REPLACED', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['ORIGINAL', 'REPLACED', 'UNKNOWN'])
  public batteryReplacementStatus?: 'ORIGINAL' | 'REPLACED' | 'UNKNOWN';

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  public conditionGrade?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ type: String, maxLength: 2_000, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(2_000)
  public cosmeticNotes?: string | null;

  @ApiPropertyOptional({
    type: Object,
    description: 'Versioned checklist object with schemaVersion=1 and partial items map',
  })
  @IsOptional()
  @IsObject()
  public checks?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ['NONE_KNOWN', 'KNOWN', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['NONE_KNOWN', 'KNOWN', 'UNKNOWN'])
  public repairHistoryStatus?: 'NONE_KNOWN' | 'KNOWN' | 'UNKNOWN';

  @ApiPropertyOptional({ type: String, maxLength: 2_000, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(2_000)
  public repairNotes?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @Allow()
  public replacedParts?: unknown;
}
