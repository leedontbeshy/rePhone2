import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const optionalTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const multipartInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class UpdateStoreSettingsDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  public expectedVersion!: number;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public storeName?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 32 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 32)
  public storePhone?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 2_000 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 2_000)
  public storeAddress?: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d{1,15}$', example: '30000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}$/)
  public defaultShippingFee?: string;

  @ApiPropertyOptional({ type: String, pattern: '^[1-9]\\d{0,14}$', example: '500000' })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,14}$/)
  public shippingDepositAmount?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  public pickupHoldMinutes?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  public depositProofWindowMinutes?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  public depositReviewWindowMinutes?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 3_650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_650)
  public defaultWarrantyDays?: number;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 10_000 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 10_000)
  public defaultWarrantyTerms?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public bankName?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public bankAccountNumber?: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 255)
  public bankAccountHolder?: string;
}

export class UploadStoreBankQrDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @Transform(multipartInteger)
  @IsInt()
  @Min(1)
  public expectedVersion!: number;
}
