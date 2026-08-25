import { Transform } from 'class-transformer';
import {
  IsDateString,
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
import {
  AFTER_SALES_STATUSES,
  AFTER_SALES_TYPES,
  type AfterSalesStatus,
  type AfterSalesType,
} from './after-sales-policy.js';

const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};

export class AfterSalesPaginationDto {
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

export class CustomerAfterSalesListQueryDto extends AfterSalesPaginationDto {
  @ApiPropertyOptional({ enum: AFTER_SALES_TYPES })
  @IsOptional()
  @IsIn(AFTER_SALES_TYPES)
  public type?: AfterSalesType;

  @ApiPropertyOptional({ enum: AFTER_SALES_STATUSES })
  @IsOptional()
  @IsIn(AFTER_SALES_STATUSES)
  public status?: AfterSalesStatus;
}

export class BackofficeAfterSalesListQueryDto extends CustomerAfterSalesListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public q?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public assignedToId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  public createdTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'requestedAt'], default: 'requestedAt' })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'requestedAt'])
  public sortBy: 'createdAt' | 'updatedAt' | 'requestedAt' = 'requestedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  public sortOrder: 'asc' | 'desc' = 'desc';
}

export class AfterSalesRequestNumberParamsDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  public requestNumber!: string;
}

export class AfterSalesIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public id!: string;
}

export class AfterSalesAttachmentParamsDto extends AfterSalesRequestNumberParamsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public attachmentId!: string;
}

export class BackofficeAfterSalesAttachmentParamsDto extends AfterSalesIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public attachmentId!: string;
}

export class CreateAfterSalesRequestDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public orderItemId!: string;

  @ApiProperty({ enum: AFTER_SALES_TYPES })
  @IsIn(AFTER_SALES_TYPES)
  public type!: AfterSalesType;

  @ApiProperty({ type: String, minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  public issueDescription!: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 500)
  public requestedResolution?: string;
}

export class CancelAfterSalesRequestDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}

export class AssignAfterSalesRequestDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  public employeeId?: string | null;
}

export class ReceiveAfterSalesRequestDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public receivedLocationId!: string;

  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 1000 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 1000)
  public note?: string;
}

export class RecordAfterSalesInspectionSummaryDto {
  @ApiProperty({ type: String, minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  public inspectionSummary!: string;
}

export class ApproveAfterSalesRequestDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public note!: string;
}

export class RejectAfterSalesRequestDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public reason!: string;

  @ApiPropertyOptional({ type: String, minLength: 5, maxLength: 1000 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(5, 1000)
  public returnNote?: string;
}

export class ResolveAfterSalesDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public resolutionNote!: string;
}

export class ResolveAfterSalesReplacedDto extends ResolveAfterSalesDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public replacementInventoryUnitId!: string;
}

export class ResolveAfterSalesRefundedDto extends ResolveAfterSalesDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public refundId!: string;
}
