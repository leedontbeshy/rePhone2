import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import {
  ProductDetailResponse,
  ProductListResponse,
  UsedIphoneDetailResponse,
  IphoneVariantDto,
  AccessoryVariantDto,
} from './catalog-response.dto.js';
import { ProductListQueryDto, ProductSlugParamsDto, UsedIphoneParamsDto } from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@ApiExtraModels(IphoneVariantDto, AccessoryVariantDto)
@Controller('products')
export class CatalogController {
  public constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: 'listProducts', summary: 'Browse the grouped public catalog' })
  @ApiOkResponse({ type: ProductListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public listProducts(@Query() query: ProductListQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get(':slug/units/:inventoryCode')
  @ApiOperation({
    operationId: 'getUsedIphoneByInventoryCode',
    summary: 'Get one exact public used iPhone unit',
  })
  @ApiOkResponse({ type: UsedIphoneDetailResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public getUsedIphone(@Param() params: UsedIphoneParamsDto) {
    return this.catalogService.getUsedIphone(params.slug, params.inventoryCode);
  }

  @Get(':slug')
  @ApiOperation({ operationId: 'getProductBySlug', summary: 'Get a public product detail' })
  @ApiOkResponse({ type: ProductDetailResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public getProduct(@Param() params: ProductSlugParamsDto) {
    return this.catalogService.getProduct(params.slug);
  }
}
