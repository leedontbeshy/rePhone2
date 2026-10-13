import { applyDecorators, Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import {
  ProductDetailResponse,
  ProductListResponse,
  UsedIphoneDetailResponse,
  IphoneVariantDto,
  AccessoryVariantDto,
  PublicUnitListResponse,
} from './catalog-response.dto.js';
import {
  PRODUCT_SORT_FIELDS,
  ProductListQueryDto,
  ProductSlugParamsDto,
  UsedIphoneParamsDto,
  PublicUnitListQueryDto,
} from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@ApiExtraModels(IphoneVariantDto, AccessoryVariantDto)
@Controller('products')
export class CatalogController {
  public constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: 'listProducts', summary: 'Browse the grouped public catalog' })
  @ApiProductListQueries()
  @ApiOkResponse({ type: ProductListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public listProducts(@Query() query: ProductListQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('units')
  @ApiOperation({
    operationId: 'listPublicInventoryUnits',
    summary: 'Available exact units, optionally prioritizing featured units',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 30, default: 24 })
  @ApiQuery({ name: 'featuredFirst', required: false, type: Boolean, default: false })
  @ApiOkResponse({ type: PublicUnitListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public listUnits(@Query() query: PublicUnitListQueryDto) {
    return this.catalogService.listUnits(query);
  }

  @Get(':slug/units/:inventoryCode')
  @ApiOperation({
    operationId: 'getUsedIphoneByInventoryCode',
    summary: 'Get one exact public used iPhone unit',
  })
  @ApiParam({
    name: 'slug',
    schema: { type: 'string', maxLength: 180 },
    example: 'iphone-13',
  })
  @ApiParam({
    name: 'inventoryCode',
    schema: { type: 'string', maxLength: 64 },
    example: 'IP13-MID-001',
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
  @ApiParam({
    name: 'slug',
    schema: { type: 'string', maxLength: 180 },
    example: 'iphone-13',
  })
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

function ApiProductListQueries() {
  return applyDecorators(
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 }),
    ApiQuery({ name: 'productType', required: false, enum: ['IPHONE', 'ACCESSORY'] }),
    ApiQuery({
      name: 'releaseYear',
      required: false,
      type: Number,
      minimum: 2007,
      maximum: 2100,
    }),
    ApiQuery({ name: 'storageCapacityGb', required: false, type: Number, minimum: 1 }),
    ApiQuery({ name: 'ramGb', required: false, type: Number, minimum: 1, maximum: 64 }),
    ApiQuery({
      name: 'simLockStatus',
      required: false,
      enum: ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'],
    }),
    ApiQuery({ name: 'colorName', required: false, type: String, maxLength: 255 }),
    ApiQuery({
      name: 'minPrice',
      required: false,
      type: String,
      pattern: '^[0-9]+$',
      maxLength: 15,
    }),
    ApiQuery({
      name: 'maxPrice',
      required: false,
      type: String,
      pattern: '^[0-9]+$',
      maxLength: 15,
    }),
    ApiQuery({ name: 'inStock', required: false, type: Boolean }),
    ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      type: Number,
      minimum: 1,
      maximum: 100,
      default: 20,
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      enum: PRODUCT_SORT_FIELDS,
      default: 'createdAt',
    }),
    ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' }),
  );
}
