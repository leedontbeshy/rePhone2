import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CheckoutFulfillmentType } from './order.dto.js';

export class CheckoutTargetSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public productId!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public variantId!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
}

export class CheckoutPreviewItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public cartItemId!: string;
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] }) public itemType!: 'IPHONE' | 'ACCESSORY';
  @ApiProperty({ type: () => CheckoutTargetSummaryDto }) public target!: CheckoutTargetSummaryDto;
  @ApiProperty({ type: Number, minimum: 1 }) public quantity!: number;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public unitPrice!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public lineSubtotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public discountAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public lineTotal!: string;
}

export class CheckoutPricingDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public subtotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public itemDiscountAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public voucherDiscountAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public shippingFee!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public depositRequired!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public balanceDue!: string;
}

export class CheckoutVoucherDto {
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public discountAmount!: string;
}

export class PickupStoreSummaryDto {
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
}

export class CheckoutFulfillmentSummaryDto {
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public type!: CheckoutFulfillmentType;
  @ApiPropertyOptional({ type: () => PickupStoreSummaryDto })
  public pickupStore?: PickupStoreSummaryDto;
}

export class CheckoutPreviewDto {
  @ApiProperty({ type: String, pattern: '^v1:[a-f0-9]{64}$' })
  public previewFingerprint!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public cartUpdatedAt!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: CheckoutFulfillmentType;
  @ApiProperty({ type: () => [CheckoutPreviewItemDto] }) public items!: CheckoutPreviewItemDto[];
  @ApiProperty({ type: () => CheckoutPricingDto }) public pricing!: CheckoutPricingDto;
  @ApiPropertyOptional({ type: () => CheckoutVoucherDto }) public voucher?: CheckoutVoucherDto;
  @ApiProperty({ type: () => CheckoutFulfillmentSummaryDto })
  public fulfillmentSummary!: CheckoutFulfillmentSummaryDto;
  @ApiProperty({ type: [String] }) public warnings!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) public calculatedAt!: string;
}

export class CheckoutPreviewResponse {
  @ApiProperty({ type: () => CheckoutPreviewDto }) public data!: CheckoutPreviewDto;
}

export class OrderContactDto {
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ type: String }) public phone!: string;
}

export class OrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] }) public productType!: 'IPHONE' | 'ACCESSORY';
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiProperty({ type: String }) public sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) public configuration!: unknown;
  @ApiProperty({ type: Number }) public quantity!: number;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public unitPrice!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public lineSubtotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public discountAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public lineTotal!: string;
  @ApiProperty({ type: Number }) public warrantyDays!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) public warrantyTerms!: string | null;
  @ApiPropertyOptional({ type: () => OrderWarrantyDto, nullable: true })
  public warranty!: OrderWarrantyDto | null;
}

export class OrderWarrantyDto {
  @ApiProperty({ type: String }) public warrantyCode!: string;
  @ApiProperty({ enum: ['ACTIVE', 'VOIDED'] }) public status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public endAt!: string;
  @ApiProperty({ type: Boolean }) public isValid!: boolean;
  @ApiProperty({ type: Boolean }) public isExpired!: boolean;
}

export class OrderPricingDto extends CheckoutPricingDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public paidAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public refundedAmount!: string;
}

export class OrderBankTransferInstructionsDto {
  @ApiProperty({ type: String }) public bankName!: string;
  @ApiProperty({ type: String }) public accountNumber!: string;
  @ApiProperty({ type: String }) public accountHolder!: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) public qrUrl!:
    string | null;
  @ApiProperty({ type: String }) public transferContent!: string;
}

export class OrderPaymentDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] }) public purpose!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] }) public method!: string;
  @ApiProperty({
    enum: ['AWAITING_PROOF', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  })
  public status!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public expectedAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public receivedAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public transferContent!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public bankName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public bankAccountNumber!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public bankAccountHolder!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) public bankQrUrl!:
    string | null;
  @ApiPropertyOptional({ type: () => OrderBankTransferInstructionsDto, nullable: true })
  public bankTransferInstructions!: OrderBankTransferInstructionsDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public expiresAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public submittedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public reviewSlaDueAt!: string | null;
  @ApiProperty({ type: Boolean }) public reviewOverdue!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) public rejectionReason!: string | null;
}

export class OrderRefundDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public amount!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] }) public method!: string;
  @ApiProperty({ enum: ['REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED'] })
  public status!: string;
  @ApiProperty({ type: String }) public reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public terminalReason!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public processingAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public completedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public terminalAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: string;
}

export class OrderShipmentDto {
  @ApiProperty({ type: String }) public carrierName!: string;
  @ApiProperty({ type: String }) public trackingCode!: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) public trackingUrl!:
    string | null;
  @ApiProperty({
    enum: ['CREATED', 'HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'],
  })
  public status!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public shippedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public deliveredAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public failedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public returnedAt!:
    string | null;
}

export class OrderDetailDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] })
  public status!: string;
  @ApiProperty({
    enum: [
      'PENDING',
      'PREPARING',
      'READY',
      'IN_TRANSIT',
      'COMPLETED',
      'FAILED',
      'RETURNED',
      'CANCELLED',
    ],
  })
  public fulfillmentStatus!: string;
  @ApiProperty({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] })
  public paymentStatus!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: CheckoutFulfillmentType;
  @ApiProperty({ type: () => OrderContactDto }) public contact!: OrderContactDto;
  @ApiPropertyOptional({ type: Object, nullable: true }) public shippingAddress!: unknown;
  @ApiPropertyOptional({ type: () => PickupStoreSummaryDto })
  public pickupStore?: PickupStoreSummaryDto;
  @ApiProperty({ type: () => [OrderItemDto] }) public items!: OrderItemDto[];
  @ApiProperty({ type: () => OrderPricingDto }) public pricing!: OrderPricingDto;
  @ApiPropertyOptional({ type: String, nullable: true }) public voucherCode!: string | null;
  @ApiProperty({ type: () => [OrderPaymentDto] }) public paymentAttempts!: OrderPaymentDto[];
  @ApiProperty({ type: () => [OrderRefundDto] }) public refunds!: OrderRefundDto[];
  @ApiPropertyOptional({ type: () => OrderShipmentDto, nullable: true })
  public shipment!: OrderShipmentDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public customerNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public confirmedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickupHoldUntil!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickupReadyAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickedUpAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public completedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public cancelledAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public cancelReason!: string | null;
  @ApiProperty({ type: [String], enum: ['CANCEL', 'SUBMIT_PAYMENT_PROOF'] })
  public availableActions!: Array<'CANCEL' | 'SUBMIT_PAYMENT_PROOF'>;
}

export class CheckoutResultDto {
  @ApiProperty({ type: () => OrderDetailDto }) public order!: OrderDetailDto;
  @ApiPropertyOptional({ type: String, writeOnly: true, minLength: 43, maxLength: 43 })
  public guestAccessToken?: string;
}

export class CheckoutResultResponse {
  @ApiProperty({ type: () => CheckoutResultDto }) public data!: CheckoutResultDto;
}

export class OrderListItemDto {
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: CheckoutFulfillmentType;
  @ApiProperty({ type: String }) public firstItemName!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public totalItemQuantity!: number;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public depositRequired!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public balanceDue!: string;
  @ApiPropertyOptional({ type: () => OrderShipmentDto, nullable: true })
  public shipment!: OrderShipmentDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
}

export class OrderPaginationDto {
  @ApiProperty({ type: Number }) public page!: number;
  @ApiProperty({ type: Number }) public pageSize!: number;
  @ApiProperty({ type: Number }) public totalItems!: number;
  @ApiProperty({ type: Number }) public totalPages!: number;
}

export class OrderListMetaDto {
  @ApiProperty({ type: () => OrderPaginationDto }) public pagination!: OrderPaginationDto;
}

export class OrderListResponse {
  @ApiProperty({ type: () => [OrderListItemDto] }) public data!: OrderListItemDto[];
  @ApiProperty({ type: () => OrderListMetaDto }) public meta!: OrderListMetaDto;
}

export class OrderDetailResponse {
  @ApiProperty({ type: () => OrderDetailDto }) public data!: OrderDetailDto;
}
