import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
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
  ValidateIf,
} from 'class-validator';

const EMPLOYEE_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED'] as const;
const CUSTOMER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
const CUSTOMER_SORT_FIELDS = ['createdAt', 'lastLoginAt'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lowercase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const uppercase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
};
const integerQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class UserIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  public id!: string;
}

export class UserPaginationDto {
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
}

export class EmployeeListQueryDto extends UserPaginationDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public q?: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_STATUSES })
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  public status?: (typeof EMPLOYEE_STATUSES)[number];

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  public hiredFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  public hiredTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt'], default: 'createdAt' })
  @IsIn(['createdAt'])
  public sortBy = 'createdAt' as const;

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class CustomerListQueryDto extends UserPaginationDto {
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @Transform(optionalTrim)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public q?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  public status?: (typeof CUSTOMER_STATUSES)[number];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  public createdTo?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SORT_FIELDS, default: 'createdAt' })
  @IsIn(CUSTOMER_SORT_FIELDS)
  public sortBy: (typeof CUSTOMER_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'desc' })
  @IsIn(SORT_ORDERS)
  public sortOrder: (typeof SORT_ORDERS)[number] = 'desc';
}

export class CreateEmployeeDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 320 })
  @Transform(lowercase)
  @IsEmail()
  @Length(3, 320)
  public email!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public fullName!: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 32 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  public phone?: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  @Transform(uppercase)
  @IsString()
  @Length(1, 64)
  public employeeCode!: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  public hiredAt?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public fullName?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 32, nullable: true })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(1, 32)
  public phone?: string | null;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 64 })
  @Transform(uppercase)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public employeeCode?: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Matches(DATE_PATTERN)
  public hiredAt?: string | null;
}

export class UserLifecycleReasonDto {
  @ApiProperty({ type: String, minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
