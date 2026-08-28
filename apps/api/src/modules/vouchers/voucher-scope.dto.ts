import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class VoucherProductTypeScopeConfigDto {
  @ApiProperty({ enum: ['IPHONE', 'ACCESSORY'] })
  public productType!: 'IPHONE' | 'ACCESSORY';
}

export class VoucherProductsScopeConfigDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
  })
  public productIds!: string[];
}

export class VoucherVariantsScopeConfigDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
  })
  public variantIds!: string[];
}

export type VoucherScopeConfigDto =
  VoucherProductTypeScopeConfigDto | VoucherProductsScopeConfigDto | VoucherVariantsScopeConfigDto;

export function voucherScopeConfigOpenApiSchemas() {
  return [
    { $ref: getSchemaPath(VoucherProductTypeScopeConfigDto) },
    { $ref: getSchemaPath(VoucherProductsScopeConfigDto) },
    { $ref: getSchemaPath(VoucherVariantsScopeConfigDto) },
  ];
}
