import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PublicMediaDto } from '../catalog/catalog-response.dto.js';

export class DealerOfferDto {
  @ApiPropertyOptional({ type: PublicMediaDto, nullable: true })
  public image?: PublicMediaDto | null;
  @ApiProperty({ type: String }) public inventoryUnitId!: string;
  @ApiProperty({ type: String }) public inventoryCode!: string;
  @ApiProperty({ type: String }) public productName!: string;
  @ApiProperty({ type: String }) public variantName!: string;
  @ApiProperty({ type: String }) public sku!: string;
  @ApiProperty({ type: Object, additionalProperties: true }) public configuration!: unknown;
  @ApiProperty({ type: String }) public dealerPrice!: string;
  @ApiProperty({ type: String }) public publicReferencePrice!: string;
  @ApiProperty({ type: String }) public recommendedRetailPrice!: string;
  @ApiProperty({ type: Number }) public warrantyDays!: number;
  @ApiProperty({ type: String }) public warrantyTerms!: string;
}
export class DealerPreviewResultDto extends DealerOfferDto {
  @ApiProperty({ type: String }) public shippingFee!: string;
  @ApiProperty({ type: String }) public grandTotal!: string;
  @ApiProperty({ type: String }) public previewFingerprint!: string;
  @ApiProperty({ type: Number }) public pricingPolicyVersion!: number;
  @ApiProperty({ type: String }) public addressFingerprint!: string;
  @ApiProperty({ type: String, nullable: true }) public shippingQuoteId!: string | null;
  @ApiProperty({ enum: [false] }) public holdsInventory!: boolean;
}
export class DealerOfferPageDto {
  @ApiProperty({ type: [DealerOfferDto] }) public items!: DealerOfferDto[];
  @ApiProperty({ type: Number }) public page!: number;
  @ApiProperty({ type: Number }) public pageSize!: number;
  @ApiProperty({ type: Number }) public revision!: number;
  @ApiPropertyOptional({ type: Boolean }) public hasMore?: boolean;
}
export class DealerProofResultDto {
  @ApiProperty({ type: String }) public id!: string;
  @ApiProperty({ enum: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED'] })
  public status!: string;
  @ApiProperty({ type: String }) public submittedAt!: string;
  @ApiProperty({ type: String, nullable: true }) public reviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) public reason!: string | null;
}
export class DealerPaymentRequestResultDto {
  @ApiProperty({ type: String }) public id!: string;
  @ApiProperty({ type: String }) public purpose!: string;
  @ApiProperty({ type: String }) public requiredAmount!: string;
  @ApiProperty({ type: String }) public dueAt!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public transferContent!: string;
  @ApiProperty({ type: Object, additionalProperties: true }) public bank!: unknown;
  @ApiProperty({ type: [DealerProofResultDto] }) public proofs!: DealerProofResultDto[];
}
export class DealerOrderResultDto {
  @ApiProperty({ type: String }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String, nullable: true }) public externalOrderId!: string | null;
  @ApiProperty({ type: String, nullable: true }) public dealerId!: string | null;
  @ApiProperty({ type: Number }) public resourceVersion!: number;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ type: String }) public dealerPrice!: string;
  @ApiProperty({ type: String }) public shippingFee!: string;
  @ApiProperty({ type: String }) public grandTotal!: string;
  @ApiProperty({ type: String }) public paidAmount!: string;
  @ApiProperty({ type: String }) public refundedAmount!: string;
  @ApiProperty({ type: String }) public balanceDue!: string;
  @ApiProperty({ type: String }) public fundedAmount!: string;
  @ApiProperty({ type: String }) public refundObligationAmount!: string;
  @ApiProperty({ type: String }) public fundingShortfall!: string;
  @ApiProperty({ type: Boolean }) public fullyFunded!: boolean;
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true })
  public returnSettlement!: unknown;
  @ApiProperty({ type: Boolean }) public reconciliationHold!: boolean;
  @ApiProperty({ type: Object, additionalProperties: true }) public recipient!: unknown;
  @ApiProperty({ type: Object, additionalProperties: { type: 'string' } }) public customer!: Record<
    string,
    string
  >;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public items!: unknown[];
  @ApiProperty({ type: [DealerPaymentRequestResultDto] })
  public paymentRequests!: DealerPaymentRequestResultDto[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public shipments!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public refunds!: unknown[];
  @ApiProperty({ type: String, nullable: true }) public submissionDeadlineAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) public balanceDeadlineAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) public reviewStartedAt!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
}
export class DealerOrderPageDto {
  @ApiProperty({ type: [DealerOrderResultDto] }) public items!: DealerOrderResultDto[];
  @ApiProperty({ type: Number }) public total!: number;
  @ApiProperty({ type: Number }) public page!: number;
  @ApiProperty({ type: Number }) public pageSize!: number;
}
export class DealerOrderCreatedDto {
  @ApiProperty({ type: DealerOrderResultDto }) public order!: DealerOrderResultDto;
  @ApiProperty({ type: Boolean }) public replayed!: boolean;
}
export class DealerOfferResponse {
  @ApiProperty({ type: DealerOfferPageDto }) public data!: DealerOfferPageDto;
}
export class DealerPreviewResponse {
  @ApiProperty({ type: DealerPreviewResultDto }) public data!: DealerPreviewResultDto;
}
export class DealerOrderResponse {
  @ApiProperty({ type: DealerOrderResultDto }) public data!: DealerOrderResultDto;
}
export class DealerOrdersResponse {
  @ApiProperty({ type: DealerOrderPageDto }) public data!: DealerOrderPageDto;
}
export class DealerOrderCreatedResponse {
  @ApiProperty({ type: DealerOrderCreatedDto }) public data!: DealerOrderCreatedDto;
}

// Backoffice and onboarding responses contain versioned administrative records, not partner commerce data.
export class DealerRecordResponse {
  @ApiProperty({ type: Object, nullable: true, additionalProperties: true }) public data!: unknown;
}
export class DealerRecordsResponse {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public data!: unknown[];
}
