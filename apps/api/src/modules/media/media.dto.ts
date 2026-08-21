import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const multipartInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result.length === 0 ? undefined : result;
};

export class MediaResourceIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public id!: string;
}

export class UploadProductMediaDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public altText?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @IsOptional()
  @Transform(multipartInteger)
  @IsInt()
  @Min(0)
  public sortOrder?: number;
}

export class UpdateProductMediaDto {
  @ApiPropertyOptional({ type: String, maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(255)
  public altText?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  public sortOrder?: number;
}
