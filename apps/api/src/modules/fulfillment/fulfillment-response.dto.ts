import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';

export const FULFILLMENT_ACTIONS = [
  'CONFIRM',
  'START_PREPARING',
  'MARK_PICKUP_READY',
  'EXTEND_PICKUP_HOLD',
  'COMPLETE_PICKUP',
  'OVERRIDE_SHIPPING_FEE',
  'CREATE_SHIPMENT',
  'HAND_OVER_SHIPMENT',
  'MARK_SHIPMENT_DELIVERED',
  'MARK_SHIPMENT_FAILED',
  'MARK_SHIPMENT_RETURNED',
  'CANCEL_ORDER',
  'CREATE_REFUND',
] as const;
export type FulfillmentAction = (typeof FULFILLMENT_ACTIONS)[number];

export class BackofficeOrderLocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public code!: string;
  @ApiProperty({ type: String }) public name!: string;
  @ApiProperty({ enum: ['STORE', 'WAREHOUSE'] }) public type!: string;
}

export class BackofficeOrderContactDto {
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiProperty({ type: String, format: 'email' }) public email!: string;
  @ApiProperty({ type: String }) public phone!: string;
}

export class BackofficeActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class BackofficeWarrantyDto {
  @ApiProperty({ type: String }) public warrantyCode!: string;
  @ApiProperty({ enum: ['ACTIVE', 'VOIDED'] }) public status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public endAt!: string;
}

export class BackofficeOrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] }) public productType!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiProperty({ type: String }) public sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public inventoryCode!: string | null;
  @ApiProperty({ type: Number, minimum: 1 }) public quantity!: number;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public unitPrice!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public lineTotal!: string;
  @ApiProperty({ type: Number, minimum: 0 }) public warrantyDays!: number;
  @ApiPropertyOptional({ type: () => BackofficeWarrantyDto, nullable: true })
  public warranty!: BackofficeWarrantyDto | null;
}

export class BackofficeReservationDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED'] }) public status!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'REVIEW', 'PICKUP', 'FULFILLMENT'] }) public holdReason!: string;
  @ApiProperty({ enum: ['INVENTORY_UNIT', 'STOCK_LEVEL'] }) public targetType!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public quantity!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public expiresAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public releasedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public consumedAt!:
    string | null;
}

export class BackofficeOrderPaymentDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] }) public purpose!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] }) public method!: string;
  @ApiProperty({
    enum: ['AWAITING_PROOF', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  })
  public status!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public expectedAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public receivedAmount!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public reviewedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public reviewerName!: string | null;
}

export class BackofficeOrderRefundDto {
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

export class BackofficeOrderShipmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) public orderId!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public attemptNumber!: number;
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
  @ApiPropertyOptional({ type: String, nullable: true }) public failureReason!: string | null;
  @ApiPropertyOptional({ type: () => BackofficeOrderLocationDto, nullable: true })
  public returnedToLocation!: BackofficeOrderLocationDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public returnNote!: string | null;
  @ApiPropertyOptional({ type: () => BackofficeActorDto, nullable: true })
  public createdBy!: BackofficeActorDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: string;
}

export class BackofficeOrderShipmentResponse {
  @ApiProperty({ type: () => BackofficeOrderShipmentDto })
  public data!: BackofficeOrderShipmentDto;
}

export class BackofficeShippingFeeOverrideDto {
  @ApiProperty({ type: String }) public reason!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public overriddenAt!: string;
  @ApiProperty({ type: () => BackofficeActorDto }) public overriddenBy!: BackofficeActorDto;
}

export class BackofficeOrderPricingDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public subtotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public voucherDiscountAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public shippingFeeOriginal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public shippingFee!: string;
  @ApiPropertyOptional({ type: () => BackofficeShippingFeeOverrideDto, nullable: true })
  public shippingFeeOverride!: BackofficeShippingFeeOverrideDto | null;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public depositRequired!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public paidAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public refundedAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public balanceDue!: string;
}

export class BackofficeOrderListItemDto {
  @ApiPropertyOptional({ enum: ['STOREFRONT', 'DEALER'] }) public channel?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public dealerId?: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public customerName!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ type: String }) public firstItemName!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public totalItemQuantity!: number;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public balanceDue!: string;
  @ApiProperty({ type: () => BackofficeOrderLocationDto })
  public location!: BackofficeOrderLocationDto;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickupHoldUntil!: string | null;
  @ApiProperty({ type: Boolean }) public pickupOverdue!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
  @ApiProperty({ type: [String], enum: FULFILLMENT_ACTIONS })
  public availableActions!: FulfillmentAction[];
}

export class BackofficeOrderDetailDto {
  @ApiPropertyOptional({ type: Boolean }) public hasAffiliateCommission?: boolean;
  @ApiPropertyOptional({ enum: ['STOREFRONT', 'DEALER'] }) public channel?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public dealerId?: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ enum: ['PICKUP', 'SHIPPING'] }) public fulfillmentType!: string;
  @ApiProperty({ type: () => BackofficeOrderContactDto })
  public contact!: BackofficeOrderContactDto;
  @ApiPropertyOptional({ type: Object, nullable: true }) public shippingAddress!: unknown;
  @ApiProperty({ type: () => BackofficeOrderLocationDto })
  public location!: BackofficeOrderLocationDto;
  @ApiProperty({ type: () => [BackofficeOrderItemDto] }) public items!: BackofficeOrderItemDto[];
  @ApiProperty({ type: () => BackofficeOrderPricingDto })
  public pricing!: BackofficeOrderPricingDto;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public refundableAmount!: string;
  @ApiProperty({ type: () => [BackofficeReservationDto] })
  public reservations!: BackofficeReservationDto[];
  @ApiProperty({ type: () => [BackofficeOrderPaymentDto] })
  public paymentAttempts!: BackofficeOrderPaymentDto[];
  @ApiProperty({ type: () => [BackofficeOrderRefundDto] })
  public refunds!: BackofficeOrderRefundDto[];
  @ApiProperty({ type: () => [BackofficeOrderShipmentDto] })
  public shipments!: BackofficeOrderShipmentDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) public voucherCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public customerNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public internalNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public placedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public confirmedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickupHoldUntil!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public pickupReadyAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public pickedUpAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public completedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public cancelledAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public cancelReason!: string | null;
  @ApiProperty({ type: Boolean }) public pickupOverdue!: boolean;
  @ApiProperty({ type: [String], enum: FULFILLMENT_ACTIONS })
  public availableActions!: FulfillmentAction[];
}

export class BackofficeOrderDetailResponse {
  @ApiProperty({ type: () => BackofficeOrderDetailDto }) public data!: BackofficeOrderDetailDto;
}

export class BackofficeOrderListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class BackofficeOrderListResponse {
  @ApiProperty({ type: () => [BackofficeOrderListItemDto] })
  public data!: BackofficeOrderListItemDto[];
  @ApiProperty({ type: () => BackofficeOrderListMetaDto }) public meta!: BackofficeOrderListMetaDto;
}
