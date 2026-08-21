import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import {
  ArchiveReasonDto,
  BackofficeProductListQueryDto,
  CreateProductDto,
  CreateVariantDto,
  ProductVariantParamsDto,
  ResourceIdParamsDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './backoffice-catalog.dto.js';
import {
  BackofficeProductListResponse,
  BackofficeProductResponse,
  BackofficeVariantResponse,
} from './backoffice-catalog-response.dto.js';
import { BackofficeCatalogService } from './backoffice-catalog.service.js';

const BACKOFFICE_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'DUPLICATE_RESOURCE or INVALID_STATE_TRANSITION' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-catalog')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/products')
export class BackofficeProductsController {
  public constructor(
    @Inject(BackofficeCatalogService) private readonly service: BackofficeCatalogService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeProducts' })
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 })
  @ApiQuery({ name: 'type', required: false, enum: ['IPHONE', 'ACCESSORY'] })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] })
  @ApiQuery({ name: 'releaseYear', required: false, type: Number, minimum: 2007, maximum: 2100 })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'updatedAt', 'name', 'releaseYear'],
    default: 'updatedAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: BackofficeProductListResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public list(@Query() query: BackofficeProductListQueryDto) {
    return this.service.listProducts(query);
  }

  @Post()
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createBackofficeProduct' })
  @ApiBody({ type: CreateProductDto })
  @ApiCreatedResponse({ type: BackofficeProductResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public create(
    @Body() input: CreateProductDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.createProduct(input, auditActor(auth, request));
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeProduct' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeProductResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public get(@Param() params: ResourceIdParamsDto) {
    return this.service.getProduct(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeProduct' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({ type: BackofficeProductResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public update(
    @Param() params: ResourceIdParamsDto,
    @Body() input: UpdateProductDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.updateProduct(params.id, input, auditActor(auth, request));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'publishBackofficeProduct' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeProductResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public publish(
    @Param() params: ResourceIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.publishProduct(params.id, auditActor(auth, request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'archiveBackofficeProduct' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: ArchiveReasonDto })
  @ApiOkResponse({ type: BackofficeProductResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public archive(
    @Param() params: ResourceIdParamsDto,
    @Body() input: ArchiveReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.archiveProduct(params.id, input, auditActor(auth, request));
  }

  @Post(':productId/variants')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createBackofficeVariant' })
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateVariantDto })
  @ApiCreatedResponse({ type: BackofficeVariantResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public createVariant(
    @Param() params: ProductVariantParamsDto,
    @Body() input: CreateVariantDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.createVariant(params.productId, input, auditActor(auth, request));
  }
}

@ApiTags('backoffice-catalog')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/variants')
export class BackofficeVariantsController {
  public constructor(
    @Inject(BackofficeCatalogService) private readonly service: BackofficeCatalogService,
  ) {}

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeVariant' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateVariantDto })
  @ApiOkResponse({ type: BackofficeVariantResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public update(
    @Param() params: ResourceIdParamsDto,
    @Body() input: UpdateVariantDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.updateVariant(params.id, input, auditActor(auth, request));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'activateBackofficeVariant' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeVariantResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public activate(
    @Param() params: ResourceIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.activateVariant(params.id, auditActor(auth, request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'archiveBackofficeVariant' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: ArchiveReasonDto })
  @ApiOkResponse({ type: BackofficeVariantResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public archive(
    @Param() params: ResourceIdParamsDto,
    @Body() input: ArchiveReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.archiveVariant(params.id, input, auditActor(auth, request));
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
