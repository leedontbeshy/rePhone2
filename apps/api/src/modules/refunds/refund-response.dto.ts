import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../catalog/catalog-response.dto.js';
import { REFUND_METHODS, REFUND_STATUSES } from './refund.dto.js';

export const REFUND_ACTIONS = [
  'START_PROCESSING',
  'COMPLETE_BANK_TRANSFER',
  'COMPLETE_CASH',
  'REJECT',
  'CANCEL',
  'VIEW_EVIDENCE',
] as const;
export type RefundAction = (typeof REFUND_ACTIONS)[number];

export class RefundActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public employeeCode!: string | null;
}

export class RefundOrderSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String }) public fulfillmentStatus!: string;
  @ApiProperty({ type: String }) public paymentStatus!: string;
  @ApiProperty({ type: String }) public customerName!: string;
  @ApiProperty({ type: String, format: 'email' }) public customerEmail!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public grandTotal!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public paidAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public refundedAmount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public balanceDue!: string;
}

export class RefundPaymentSourceDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] }) public purpose!: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] }) public method!: string;
  @ApiProperty({ type: String }) public status!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public expectedAmount!: string;
  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true }) public receivedAmount!:
    string | null;
}

export class RefundListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public orderNumber!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) public amount!: string;
  @ApiProperty({ enum: REFUND_METHODS }) public method!: string;
  @ApiProperty({ enum: REFUND_STATUSES }) public status!: string;
  @ApiProperty({ enum: ['CUSTOMER', 'STAFF', 'SYSTEM'] }) public requestedByType!: string;
  @ApiPropertyOptional({ type: () => RefundActorDto, nullable: true }) public requester!:
    RefundActorDto | null;
  @ApiProperty({ type: Boolean }) public evidenceAvailable!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public processingAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public completedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) public terminalAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: string;
}

export class RefundDetailDto extends RefundListItemDto {
  @ApiProperty({ type: () => RefundOrderSummaryDto }) public order!: RefundOrderSummaryDto;
  @ApiPropertyOptional({ type: () => RefundPaymentSourceDto, nullable: true }) public payment!:
    RefundPaymentSourceDto | null;
  @ApiProperty({ type: String }) public reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) public note!: string | null;
  @ApiPropertyOptional({ type: () => RefundActorDto, nullable: true }) public processor!:
    RefundActorDto | null;
  @ApiPropertyOptional({ type: () => RefundActorDto, nullable: true }) public terminalActor!:
    RefundActorDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) public terminalReason!: string | null;
  @ApiProperty({ type: [String], enum: REFUND_ACTIONS }) public availableActions!: RefundAction[];
}

export class RefundListMetaDto {
  @ApiProperty({ type: () => PaginationDto }) public pagination!: PaginationDto;
}

export class RefundListResponse {
  @ApiProperty({ type: () => [RefundListItemDto] }) public data!: RefundListItemDto[];
  @ApiProperty({ type: () => RefundListMetaDto }) public meta!: RefundListMetaDto;
}

export class RefundDetailResponse {
  @ApiProperty({ type: () => RefundDetailDto }) public data!: RefundDetailDto;
}

export class RefundEvidenceUrlDto {
  @ApiProperty({ type: String, format: 'uri' }) public url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) public expiresAt!: string;
}

export class RefundEvidenceUrlResponse {
  @ApiProperty({ type: () => RefundEvidenceUrlDto }) public data!: RefundEvidenceUrlDto;
}
