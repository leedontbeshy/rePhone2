import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
} from 'class-validator';
import { AFFILIATE_TERMS } from '../affiliate-core/affiliate.policy.js';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class AffiliateIdDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public id!: string;
}
export class AffiliateApplicationDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  public displayName!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @Matches(/^(?:\+84|0)[0-9]{9,10}$/)
  public phone!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 1000)
  public promotionChannels!: string;
  @ApiProperty({ enum: [AFFILIATE_TERMS] }) @IsIn([AFFILIATE_TERMS]) public termsVersion!: string;
}
export class AffiliatePolicyDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public enabled!: boolean;
  @ApiProperty({ type: Number, minimum: 0, maximum: 500 })
  @IsInt()
  @Min(0)
  @Max(500)
  public rateBps!: number;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9]\d{0,14})$/) public reserveAmount!: string;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9]\d{0,14})$/) public minimumProfit!: string;
  @ApiProperty({ type: Number, minimum: 0 }) @IsInt() @Min(0) public expectedVersion!: number;
}
export class AffiliateOverrideDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public enabled!: boolean;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  public rateBps?: number;
}
export class AffiliateTransitionDto {
  @ApiProperty({ enum: ['ACTIVE', 'REJECTED', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'REJECTED', 'SUSPENDED'])
  public status!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() public payoutHold!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) public expectedVersion!: number;
}
export class AffiliateBankDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  public bankName!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  public accountHolder!: string;
  @ApiProperty({ type: String }) @Matches(/^[0-9]{6,30}$/) public accountNumber!: string;
  @ApiProperty({ type: String }) @IsString() @Length(8, 128) public currentPassword!: string;
}
export class AffiliateTokenDto {
  @ApiProperty({ type: String }) @Matches(/^[\w-]{43}$/) public token!: string;
}
export class AffiliateReferralDto {
  @ApiProperty({ type: String }) @Matches(/^[a-f0-9]{16}$/) public code!: string;
}
export class AffiliateWithdrawalDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() public requestKey!: string;
}
export class AffiliatePayoutActionDto {
  @ApiProperty({ enum: ['PROCESSING', 'REJECTED', 'CANCELLED', 'NEEDS_REVIEW'] })
  @IsIn(['PROCESSING', 'REJECTED', 'CANCELLED', 'NEEDS_REVIEW'])
  public status!: string;
  @ApiProperty({ type: String }) @Transform(trim) @IsString() @Length(5, 500) public note!: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  public confirmedNotTransferred?: boolean;
}
export class AffiliateCompleteDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @Matches(/^[A-Za-z0-9._:/-]{3,150}$/)
  public transferReference!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  public transferredAt!: string;
  @ApiProperty({ type: String }) @Transform(trim) @IsString() @Length(5, 500) public note!: string;
}
export class AffiliateListDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 100)
  public search?: string;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  public page = 1;
}
export class AffiliateRecordResponse {
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true }) public data!: Record<
    string,
    unknown
  > | null;
}
