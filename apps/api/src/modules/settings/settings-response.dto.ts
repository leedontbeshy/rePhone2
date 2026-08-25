import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicPickupStoreDto {
  @ApiProperty({ type: String }) public locationName!: string;
  @ApiProperty({ type: String }) public address!: string;
  @ApiProperty({ type: Number, minimum: 1 }) public holdMinutes!: number;
}

export class PublicStoreDto {
  @ApiProperty({ type: String }) public storeName!: string;
  @ApiProperty({ type: String }) public storePhone!: string;
  @ApiProperty({ type: String }) public storeAddress!: string;
  @ApiProperty({ enum: ['VND'] }) public currency!: string;
  @ApiProperty({ enum: ['Asia/Ho_Chi_Minh'] }) public timezone!: string;
  @ApiProperty({ type: () => PublicPickupStoreDto }) public pickup!: PublicPickupStoreDto;
}

export class StoreSettingsActorDto {
  @ApiProperty({ type: String, format: 'uuid' }) public id!: string;
  @ApiProperty({ type: String }) public fullName!: string;
}

export class StoreSettingsDto {
  @ApiProperty({ type: String }) public storeName!: string;
  @ApiProperty({ type: String }) public storePhone!: string;
  @ApiProperty({ type: String }) public storeAddress!: string;
  @ApiProperty({ enum: ['VND'] }) public currency!: string;
  @ApiProperty({ enum: ['Asia/Ho_Chi_Minh'] }) public timezone!: string;
  @ApiProperty({ type: String }) public defaultShippingFee!: string;
  @ApiProperty({ type: String }) public shippingDepositAmount!: string;
  @ApiProperty({ type: Number }) public pickupHoldMinutes!: number;
  @ApiProperty({ type: Number }) public depositProofWindowMinutes!: number;
  @ApiProperty({ type: Number }) public depositReviewWindowMinutes!: number;
  @ApiProperty({ type: Number }) public defaultWarrantyDays!: number;
  @ApiProperty({ type: String }) public defaultWarrantyTerms!: string;
  @ApiProperty({ type: String }) public bankName!: string;
  @ApiProperty({ type: String }) public bankAccountNumber!: string;
  @ApiProperty({ type: String }) public bankAccountHolder!: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true })
  public bankQrUrl!: string | null;
  @ApiProperty({ type: Number, minimum: 1 }) public version!: number;
  @ApiPropertyOptional({ type: () => StoreSettingsActorDto, nullable: true })
  public updatedBy!: StoreSettingsActorDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) public createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) public updatedAt!: Date;
}

export class PublicStoreResponse {
  @ApiProperty({ type: () => PublicStoreDto }) public data!: PublicStoreDto;
}

export class StoreSettingsResponse {
  @ApiProperty({ type: () => StoreSettingsDto }) public data!: StoreSettingsDto;
}
