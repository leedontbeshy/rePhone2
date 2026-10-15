import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  AdjustStockDto,
  ReceiveStockDto,
  ReturnStockDto,
  StockLevelListQueryDto,
  StockMovementListQueryDto,
  StockPaginationDto,
  TransferStockDto,
} from './stock.dto.js';
import {
  StockCommandResponse,
  StockLevelListResponse,
  StockMovementListResponse,
  StockVariantListResponse,
} from './stock-response.dto.js';
import { StockService } from './stock.service.js';

const STOCK_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description: 'DUPLICATE_RESOURCE, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-stock')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice')
export class StockController {
  public constructor(@Inject(StockService) private readonly service: StockService) {}

  @Get('stock-variants')
  @ApiOperation({ operationId: 'listBackofficeStockVariants' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ type: StockVariantListResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public listVariants(@Query() query: StockPaginationDto) {
    return this.service.listVariants(query);
  }

  @Get('stock-levels')
  @ApiOperation({ operationId: 'listBackofficeStockLevels' })
  @ApiQuery({ name: 'variantId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ type: StockLevelListResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public listLevels(@Query() query: StockLevelListQueryDto) {
    return this.service.listLevels(query);
  }

  @Get('stock-movements')
  @ApiOperation({ operationId: 'listBackofficeStockMovements' })
  @ApiQuery({ name: 'variantId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['RECEIPT', 'SALE', 'RETURN', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WRITE_OFF'],
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'referenceType', required: false, type: String, maxLength: 255 })
  @ApiQuery({ name: 'referenceId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ type: StockMovementListResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public listMovements(@Query() query: StockMovementListQueryDto) {
    return this.service.listMovements(query);
  }

  @Post('stock/receive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'receiveBackofficeStock' })
  @ApiBody({ type: ReceiveStockDto })
  @ApiOkResponse({ type: StockCommandResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public receive(
    @Body() input: ReceiveStockDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.receive(input, auditActor(auth, request));
  }

  @Post('stock/transfer')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'transferBackofficeStock' })
  @ApiBody({ type: TransferStockDto })
  @ApiOkResponse({ type: StockCommandResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public transfer(
    @Body() input: TransferStockDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.transfer(input, auditActor(auth, request));
  }

  @Post('stock/adjust')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'adjustBackofficeStock' })
  @ApiBody({ type: AdjustStockDto })
  @ApiOkResponse({ type: StockCommandResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public adjust(
    @Body() input: AdjustStockDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.adjust(input, auditActor(auth, request));
  }

  @Post('stock/return')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'returnBackofficeStock' })
  @ApiBody({ type: ReturnStockDto })
  @ApiOkResponse({ type: StockCommandResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public returnStock(
    @Body() input: ReturnStockDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.returnStock(input, auditActor(auth, request));
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
