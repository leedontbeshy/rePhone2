import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckoutContactDto, CheckoutShippingAddressDto } from '../orders/order.dto.js';
import { DEALER_SCOPES } from './dealer-context.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class DealerIdParams {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public id!: string;
}
export class DealerAttachmentParams extends DealerIdParams {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public attachmentId!: string;
}
export class DealerRefundRebindDto extends DealerIdParams {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
export class DealerPageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize = 20;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  public q?: string;
}
export class DealerCatalogQuery extends DealerPageQuery {
  @ApiPropertyOptional({ enum: ['newest', 'price-asc', 'price-desc'] })
  @IsOptional()
  @IsIn(['newest', 'price-asc', 'price-desc'])
  public sort: 'newest' | 'price-asc' | 'price-desc' = 'newest';
  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  public condition?: string;
}
export class DealerApplicationDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  public legalName!: string;
  @ApiProperty({ enum: ['HOUSEHOLD', 'COMPANY', 'INDIVIDUAL'] })
  @IsIn(['HOUSEHOLD', 'COMPANY', 'INDIVIDUAL'])
  public businessType!: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9-]{8,20}$/, {
    message: 'Mã số thuế phải có từ 8 đến 20 ký tự, chỉ gồm chữ số và dấu gạch ngang.',
  })
  public taxCode?: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  public representativeName!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 1000)
  public businessAddress!: string;
  @ApiProperty({ type: String }) @IsEmail() @MaxLength(320) public contactEmail!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(8, 32)
  public contactPhone!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  public displayName!: string;
  @ApiProperty({ type: [String], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i, { each: true })
  public approvedDomains!: string[];
  @ApiProperty({ example: 'dealer-v1.0' }) @IsIn(['dealer-v1.0']) public termsVersion!: string;
}
export class DealerReasonDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  public reason!: string;
}
export class DealerChannelDto extends DealerReasonDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public open!: boolean;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public expectedVersion!: number;
}
export class DealerTransitionDto extends DealerReasonDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'SUSPEND', 'RESUME', 'CLOSE', 'LOCK', 'UNLOCK'] })
  @IsIn(['APPROVE', 'REJECT', 'SUSPEND', 'RESUME', 'CLOSE', 'LOCK', 'UNLOCK'])
  public action!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public expectedVersion!: number;
}
export class DealerReauthDto {
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 128) public currentPassword!: string;
}
export class DealerBankAccountDto extends DealerReauthDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  public bankName!: string;
  @ApiProperty({ writeOnly: true }) @Matches(/^[0-9]{6,34}$/) public accountNumber!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  public accountHolder!: string;
}
export class DealerBankTokenDto {
  @ApiProperty({ writeOnly: true }) @Matches(/^[A-Za-z0-9_-]{43}$/) public token!: string;
}
export class DealerCreateKeyDto extends DealerReauthDto {
  @ApiProperty({ type: String }) @Transform(trim) @IsString() @Length(2, 100) public name!: string;
  @ApiProperty({ type: [String], enum: [...DEALER_SCOPES] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(DEALER_SCOPES, { each: true })
  public scopes!: string[];
}
export class DealerPricingDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public enabled!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(9900) public discountBps!: number;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public reserveAmount!: string;
  @ApiProperty({ type: String }) @Matches(/^[1-9][0-9]{0,14}$/) public minimumProfit!: string;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public shippingFee!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  public supportedProvinces!: string[];
  @ApiProperty({ type: Number }) @IsInt() @Min(1) public expectedVersion!: number;
}
export class DealerInventoryOverrideDto extends DealerReasonDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public enabled!: boolean;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(/^[1-9][0-9]{0,14}$/)
  public price?: string;
}
export class DealerPreviewDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public inventoryUnitId!: string;
  @ApiProperty({ type: () => CheckoutShippingAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  public shippingAddress!: CheckoutShippingAddressDto;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() public shippingQuoteId?: string;
}
export class DealerCreateOrderDto extends DealerPreviewDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(1, 128)
  public externalOrderId!: string;
  @ApiProperty({ type: String }) @Matches(/^[0-9a-f]{64}$/) public previewFingerprint!: string;
  @ApiProperty({ type: () => CheckoutContactDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutContactDto)
  public contact!: CheckoutContactDto;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  public note?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public linkedOriginalOrderId?: string;
}
export class DealerShippingQuoteDto extends DealerReasonDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public dealerId!: string;
  @ApiProperty({ type: () => CheckoutShippingAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  public shippingAddress!: CheckoutShippingAddressDto;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public shippingFee!: string;
}
export class DealerReceiptDto extends DealerReasonDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() public dealerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() public orderId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() public proofId?: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(2, 128)
  public bankAccountKey!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(1, 128)
  public bankReference!: string;
  @ApiProperty({ type: String }) @Matches(/^[1-9][0-9]{0,14}$/) public receivedAmount!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601() public receivedAt!: string;
}
export class DealerRefundDto extends DealerReasonDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public dealerId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() public orderId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public bankTransactionId?: string;
  @ApiProperty({ type: String }) @Matches(/^[1-9][0-9]{0,14}$/) public amount!: string;
}
export class DealerRefundActionDto extends DealerReasonDto {
  @ApiProperty({
    enum: ['START', 'HOLD', 'RELEASE', 'REJECT', 'CANCEL', 'MARK_SENT', 'MARK_UNKNOWN'],
  })
  @IsIn(['START', 'HOLD', 'RELEASE', 'REJECT', 'CANCEL', 'MARK_SENT', 'MARK_UNKNOWN'])
  public action!: string;
}
export class DealerCorrectionDto extends DealerReasonDto {
  @ApiProperty({ type: String }) @Matches(/^-?[1-9][0-9]{0,14}$/) public amount!: string;
}
export class DealerReconciliationResolveDto extends DealerReasonDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() public applyCorrection!: boolean;
}
export class DealerRiskDto extends DealerReasonDto {
  @ApiProperty({ enum: ['NORMAL', 'ELEVATED', 'BLOCKED'] })
  @IsIn(['NORMAL', 'ELEVATED', 'BLOCKED'])
  public riskLevel!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 20 })
  @IsInt()
  @Min(0)
  @Max(20)
  public maximumUnfundedOrders!: number;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) public expectedVersion!: number;
}
export class DealerWebhookDto extends DealerReauthDto {
  @ApiProperty({ type: String }) @IsString() @Length(10, 2000) public url!: string;
}
export class DealerSimulationDto extends DealerReasonDto {
  @ApiProperty({ enum: ['PAYMENT', 'DELIVER', 'FAIL', 'RETURN', 'CANCEL', 'REFUND'] })
  @IsIn(['PAYMENT', 'DELIVER', 'FAIL', 'RETURN', 'CANCEL', 'REFUND'])
  public action!: string;
}
export class DealerAssessmentDto {
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public finding!: string;
  @ApiProperty({ enum: ['EXISTING_DEFECT', 'CUSTOMER_DAMAGE', 'NO_FAULT_FOUND', 'UNDETERMINED'] })
  @IsIn(['EXISTING_DEFECT', 'CUSTOMER_DAMAGE', 'NO_FAULT_FOUND', 'UNDETERMINED'])
  public cause!: string;
  @ApiProperty({ enum: ['COVERED', 'NOT_COVERED', 'OUT_OF_WARRANTY', 'PENDING'] })
  @IsIn(['COVERED', 'NOT_COVERED', 'OUT_OF_WARRANTY', 'PENDING'])
  public coverage!: string;
  @ApiProperty({ enum: ['REPHONE', 'DEALER', 'UNDETERMINED'] })
  @IsIn(['REPHONE', 'DEALER', 'UNDETERMINED'])
  public shippingPayer!: string;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public shippingCost!: string;
  @ApiProperty({ type: String })
  @Matches(/^(0|[1-9][0-9]{0,14})$/)
  public shippingAlreadyPaid!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public feeAgreement!: string;
}
export class DealerReturnSettlementDto extends DealerReasonDto {
  @ApiProperty({ enum: ['REPHONE', 'DEALER'] })
  @IsIn(['REPHONE', 'DEALER'])
  public responsibleParty!: string;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public outboundCost!: string;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) public returnCost!: string;
  @ApiProperty({ type: String })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  public agreement!: string;
}
