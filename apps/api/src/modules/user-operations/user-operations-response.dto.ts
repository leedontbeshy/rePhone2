import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

const EMPLOYEE_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED'] as const;
const CUSTOMER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
const DELIVERY_STATUSES = ['SENT', 'FAILED'] as const;

export class EmployeeListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ enum: EMPLOYEE_STATUSES }) public status!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public phone!: string | null;
  @ApiProperty({ type: String }) public employeeCode!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  public hiredAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public emailVerifiedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public lastLoginAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public disabledAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class EmployeeDetailDto extends EmployeeListItemDto {}

export class EmployeeCreateResultDto {
  @ApiProperty({ type: () => EmployeeDetailDto }) public employee!: EmployeeDetailDto;
  @ApiProperty({ enum: DELIVERY_STATUSES }) public deliveryStatus!: string;
}

export class InvitationDeliveryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public employeeId!: string;
  @ApiProperty({ enum: DELIVERY_STATUSES }) public deliveryStatus!: string;
}

export class CustomerListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ enum: CUSTOMER_STATUSES }) public status!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public phone!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public emailVerifiedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public lastLoginAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public suspendedAt!: Date | null;
  @ApiProperty({ type: Number, minimum: 0 }) public orderCount!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public lastOrderAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class CustomerDetailDto extends CustomerListItemDto {}

export class UserListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class EmployeeListResponse {
  @ApiProperty({ type: () => [EmployeeListItemDto] }) public data!: EmployeeListItemDto[];
  @ApiProperty({ type: () => UserListMetaDto }) public meta!: UserListMetaDto;
}

export class EmployeeDetailResponse {
  @ApiProperty({ type: () => EmployeeDetailDto }) public data!: EmployeeDetailDto;
}

export class EmployeeCreateResponse {
  @ApiProperty({ type: () => EmployeeCreateResultDto }) public data!: EmployeeCreateResultDto;
}

export class InvitationDeliveryResponse {
  @ApiProperty({ type: () => InvitationDeliveryDto }) public data!: InvitationDeliveryDto;
}

export class CustomerListResponse {
  @ApiProperty({ type: () => [CustomerListItemDto] }) public data!: CustomerListItemDto[];
  @ApiProperty({ type: () => UserListMetaDto }) public meta!: UserListMetaDto;
}

export class CustomerDetailResponse {
  @ApiProperty({ type: () => CustomerDetailDto }) public data!: CustomerDetailDto;
}
