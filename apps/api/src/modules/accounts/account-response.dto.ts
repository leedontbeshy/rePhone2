import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

const USER_ROLES = ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const;
const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

export class StaffProfileDto {
  @ApiProperty()
  public employeeCode!: string;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  public hiredAt!: Date | null;
}

export class AccountDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'email' })
  public email!: string;

  @ApiProperty({ enum: USER_ROLES })
  public role!: UserRole;

  @ApiProperty({ enum: USER_STATUSES })
  public status!: UserStatus;

  @ApiProperty()
  public fullName!: string;

  @ApiPropertyOptional({ nullable: true })
  public phone!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public emailVerifiedAt!: Date | null;

  @ApiPropertyOptional({ type: StaffProfileDto })
  public staffProfile?: StaffProfileDto;
}

export class AccountResponse {
  @ApiProperty({ type: AccountDto })
  public data!: AccountDto;
}

export class AddressDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiPropertyOptional({ nullable: true })
  public label!: string | null;

  @ApiProperty()
  public receiverName!: string;

  @ApiProperty()
  public phone!: string;

  @ApiProperty()
  public addressLine!: string;

  @ApiProperty()
  public ward!: string;

  @ApiProperty()
  public district!: string;

  @ApiProperty()
  public province!: string;

  @ApiPropertyOptional({ nullable: true })
  public postalCode!: string | null;

  @ApiProperty()
  public isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: Date;
}

export class AddressResponse {
  @ApiProperty({ type: AddressDto })
  public data!: AddressDto;
}

export class AddressListResponse {
  @ApiProperty({ type: [AddressDto] })
  public data!: AddressDto[];
}
