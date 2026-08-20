import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.constants.js';

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?!\s)(?!.*\s$)[\s\S]+$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'customer@example.com', maxLength: 320 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  public email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN)
  public password!: string;

  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public fullName!: string;

  @ApiPropertyOptional({ example: '0900000000', maxLength: 32 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  public phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'customer@example.com', maxLength: 320 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  public email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  public password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'customer@example.com', maxLength: 320 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  public email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ writeOnly: true, minLength: 20 })
  @IsString()
  @Length(20, 512)
  public token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN)
  public newPassword!: string;
}

export class AcceptEmployeeInvitationDto {
  @ApiProperty({ writeOnly: true, minLength: 20 })
  @IsString()
  @Length(20, 512)
  public token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN)
  public password!: string;
}
