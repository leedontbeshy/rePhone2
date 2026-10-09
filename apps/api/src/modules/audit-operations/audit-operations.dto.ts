import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const AUDIT_ACTOR_TYPES = ['USER', 'GUEST', 'SYSTEM', 'API_CLIENT'] as const;
const AUDIT_SORT_FIELDS = ['createdAt'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;
const ACTION_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*(?:\.[a-z][a-z0-9_]*|\.\*)$/;
const RESOURCE_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,254}$/;

const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class AuditLogIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class BackofficeAuditLogListQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public actorUserId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTOR_TYPES })
  @IsOptional()
  @IsIn(AUDIT_ACTOR_TYPES)
  public actorType?: (typeof AUDIT_ACTOR_TYPES)[number];

  @ApiPropertyOptional({
    type: String,
    maxLength: 255,
    description: 'Exact namespaced action or a namespaced prefix ending in .*',
    example: 'inventory.*',
  })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(3, 255)
  @Matches(ACTION_PATTERN)
  public action?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(RESOURCE_TYPE_PATTERN)
  public resourceType?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public resourceId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public requestId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdTo?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  public page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;

  @ApiPropertyOptional({ enum: AUDIT_SORT_FIELDS, default: 'createdAt' })
  @IsIn(AUDIT_SORT_FIELDS)
  public sortBy: (typeof AUDIT_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}
