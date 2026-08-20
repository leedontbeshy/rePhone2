import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

const USER_ROLES = ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const;
const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

export class StaffProfileDto {
  @ApiProperty({ type: String })
  public employeeCode!: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  public hiredAt!: Date | null;
}

export class AccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'email' })
  public email!: string;

  @ApiProperty({ type: String, enum: USER_ROLES })
  public role!: UserRole;

  @ApiProperty({ type: String, enum: USER_STATUSES })
  public status!: UserStatus;

  @ApiProperty({ type: String })
  public fullName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public phone!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public emailVerifiedAt!: Date | null;

  @ApiPropertyOptional({ type: () => StaffProfileDto })
  public staffProfile?: StaffProfileDto;
}

export class AccountResponse {
  @ApiProperty({ type: () => AccountDto })
  public data!: AccountDto;
}

export class AddressDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public label!: string | null;

  @ApiProperty({ type: String })
  public receiverName!: string;

  @ApiProperty({ type: String })
  public phone!: string;

  @ApiProperty({ type: String })
  public addressLine!: string;

  @ApiProperty({ type: String })
  public ward!: string;

  @ApiProperty({ type: String })
  public district!: string;

  @ApiProperty({ type: String })
  public province!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  public postalCode!: string | null;

  @ApiProperty({ type: Boolean })
  public isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: Date;
}

export class AddressResponse {
  @ApiProperty({ type: () => AddressDto })
  public data!: AddressDto;
}

export class AddressListResponse {
  @ApiProperty({ type: () => [AddressDto] })
  public data!: AddressDto[];
}
