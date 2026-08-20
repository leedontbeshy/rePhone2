import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

const USER_ROLES = ['ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const;
const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

export class RegisteredAccountDto {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'email' })
  public email!: string;

  @ApiProperty({ type: String })
  public fullName!: string;

  @ApiProperty({ type: String, enum: USER_STATUSES })
  public status!: UserStatus;
}

export class RegisteredAccountResponse {
  @ApiProperty({ type: () => RegisteredAccountDto })
  public data!: RegisteredAccountDto;
}

export class AuthUserDto {
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
}

export class AuthSessionDto {
  @ApiProperty({ type: String, description: 'Short-lived JWT access token' })
  public accessToken!: string;

  @ApiProperty({ type: Number, example: 900 })
  public expiresIn!: number;

  @ApiProperty({ type: () => AuthUserDto })
  public user!: AuthUserDto;
}

export class AuthSessionResponse {
  @ApiProperty({ type: () => AuthSessionDto })
  public data!: AuthSessionDto;
}

export class GenericAcceptedDto {
  @ApiProperty({
    type: String,
    example: 'Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi qua email.',
  })
  public message!: string;
}

export class GenericAcceptedResponse {
  @ApiProperty({ type: () => GenericAcceptedDto })
  public data!: GenericAcceptedDto;
}
