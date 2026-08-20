import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

const USER_ROLES = ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const;
const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

export class RegisteredAccountDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'email' })
  public email!: string;

  @ApiProperty()
  public fullName!: string;

  @ApiProperty({ enum: USER_STATUSES })
  public status!: UserStatus;
}

export class RegisteredAccountResponse {
  @ApiProperty({ type: RegisteredAccountDto })
  public data!: RegisteredAccountDto;
}

export class AuthUserDto {
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
}

export class AuthSessionDto {
  @ApiProperty({ description: 'Short-lived JWT access token' })
  public accessToken!: string;

  @ApiProperty({ example: 900 })
  public expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  public user!: AuthUserDto;
}

export class AuthSessionResponse {
  @ApiProperty({ type: AuthSessionDto })
  public data!: AuthSessionDto;
}

export class GenericAcceptedDto {
  @ApiProperty({ example: 'Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi qua email.' })
  public message!: string;
}

export class GenericAcceptedResponse {
  @ApiProperty({ type: GenericAcceptedDto })
  public data!: GenericAcceptedDto;
}
