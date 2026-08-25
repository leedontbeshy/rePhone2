import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const queryBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const uppercase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};

export class WarrantyPaginationDto {
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

export class WarrantyCodeParamsDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @Transform(uppercase)
  @IsString()
  @Length(1, 64)
  public warrantyCode!: string;
}

export class WarrantyIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public id!: string;
}

export class WarrantyPolicyIdParamsDto extends WarrantyIdParamsDto {}

export class WarrantyPolicyListQueryDto extends WarrantyPaginationDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public q?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  public status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  public archived?: boolean;
}

export class BackofficeWarrantyListQueryDto extends WarrantyPaginationDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public q?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'VOIDED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'VOIDED'])
  public status?: 'ACTIVE' | 'VOIDED';

  @ApiPropertyOptional({ enum: ['VALID', 'EXPIRED', 'NOT_STARTED'] })
  @IsOptional()
  @IsIn(['VALID', 'EXPIRED', 'NOT_STARTED'])
  public validity?: 'VALID' | 'EXPIRED' | 'NOT_STARTED';

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public customerId?: string;
}

export class CreateWarrantyPolicyDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  @Transform(uppercase)
  @IsString()
  @Length(1, 64)
  public code!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public name!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 3650 })
  @IsInt()
  @Min(0)
  @Max(3650)
  public defaultDays!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 10000 })
  @Transform(trim)
  @IsString()
  @Length(1, 10000)
  public terms!: string;
}

export class UpdateWarrantyPolicyDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public name?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  public defaultDays?: number;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 10000 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 10000)
  public terms?: string;
}

export class WarrantyReasonDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
