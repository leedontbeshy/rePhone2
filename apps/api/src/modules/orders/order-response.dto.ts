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
