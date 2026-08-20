import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/auth.constants.js';
import { Matches } from 'class-validator';

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?!\s)(?!.*\s$)[\s\S]+$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateAccountDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public fullName?: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(1, 32)
  public phone?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  public currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH, writeOnly: true })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN)
  public newPassword!: string;
}

export class CreateAddressDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public label?: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public receiverName!: string;

  @ApiProperty({ maxLength: 32 })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  public phone!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public addressLine!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public ward!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public district!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  public province!: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  public postalCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  public isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(1, 255)
  public label?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public receiverName?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  public phone?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public addressLine?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public ward?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public district?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  public province?: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(1, 32)
  public postalCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public isDefault?: boolean;
}
