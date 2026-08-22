import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

const PAYMENT_STATUSES = [
  'AWAITING_PROOF',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;

export class BankTransferInstructionsDto {
  @ApiProperty({ type: String }) public bankName!: string;
  @ApiProperty({ type: String }) public accountNumber!: string;
  @ApiProperty({ type: String }) public accountHolder!: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) public qrUrl!:
    string | null;
  @ApiProperty({ type: String }) public transferContent!: string;
}

export class PaymentPublicDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] }) public purpose!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] }) public method!: string;
  @ApiProperty({ enum: PAYMENT_STATUSES }) public status!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public expectedAmount!: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]+$', nullable: true })
  public receivedAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public transferContent!: string | null;
  @ApiPropertyOptional({ type: () => BankTransferInstructionsDto, nullable: true })
  public bankTransferInstructions!: BankTransferInstructionsDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public expiresAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public submittedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public reviewSlaDueAt!: string | null;
  @ApiProperty({ type: Boolean }) public reviewOverdue!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) public rejectionReason!: string | null;
}

export class PaymentPublicResponse {
  @ApiProperty({ type: () => PaymentPublicDto }) public data!: PaymentPublicDto;
}

export class BackofficePaymentListItemDto extends PaymentPublicDto {
  @ApiProperty({ type: String }) public customerName!: string;
  @ApiProperty({ type: String, format: 'email' }) public customerEmail!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: string;
}

export class BackofficePaymentListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class BackofficePaymentListResponse {
  @ApiProperty({ type: () => [BackofficePaymentListItemDto] })
  public data!: BackofficePaymentListItemDto[];
  @ApiProperty({ type: () => BackofficePaymentListMetaDto })
  public meta!: BackofficePaymentListMetaDto;
}

export class PaymentReviewerDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class BackofficePaymentOrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
  @ApiProperty({ type: Number, minimum: 1 }) public quantity!: number;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public lineTotal!: string;
}

export class BackofficePaymentOrderDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ type: String }) public customerName!: string;
  @ApiProperty({ type: String, format: 'email' }) public customerEmail!: string;
  @ApiProperty({ type: String }) public customerPhone!: string;
  @ApiPropertyOptional({ type: Object, nullable: true }) public shippingAddress!: unknown;
  @ApiProperty({ type: () => [BackofficePaymentOrderItemDto] })
  public items!: BackofficePaymentOrderItemDto[];
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public depositRequired!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public paidAmount!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public refundedAmount!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public balanceDue!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public confirmedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public cancelledAt!:
    string | null;
}

export class BackofficePaymentDetailDto {
  @ApiProperty({ type: () => PaymentPublicDto }) public payment!: PaymentPublicDto;
  @ApiProperty({ type: Boolean }) public evidenceAvailable!: boolean;
  @ApiProperty({ type: () => BackofficePaymentOrderDto }) public order!: BackofficePaymentOrderDto;
  @ApiPropertyOptional({ type: () => PaymentReviewerDto, nullable: true })
  public reviewer!: PaymentReviewerDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public reviewNote!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public reviewedAt!:
    string | null;
}

export class BackofficePaymentDetailResponse {
  @ApiProperty({ type: () => BackofficePaymentDetailDto })
  public data!: BackofficePaymentDetailDto;
}

export class PaymentEvidenceUrlDto {
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public expiresAt!: string;
}

export class PaymentEvidenceUrlResponse {
  @ApiProperty({ type: () => PaymentEvidenceUrlDto }) public data!: PaymentEvidenceUrlDto;
}

export class PaymentReviewOrderProjectionDto {
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public paidAmount!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public refundedAmount!: string;
  @ApiProperty({ type: String, pattern: '^[0-9]+$' }) public balanceDue!: string;
}

export class PaymentReviewResultDto {
  @ApiProperty({ type: () => PaymentPublicDto })
  public payment!: PaymentPublicDto;
  @ApiProperty({ type: () => PaymentReviewOrderProjectionDto })
  public order!: PaymentReviewOrderProjectionDto;
  @ApiProperty({ enum: ['SENT', 'FAILED', 'SKIPPED_REPLAY'] })
  public notificationDelivery!: 'SENT' | 'FAILED' | 'SKIPPED_REPLAY';
}

export class PaymentReviewResultResponse {
  @ApiProperty({ type: () => PaymentReviewResultDto }) public data!: PaymentReviewResultDto;
}
