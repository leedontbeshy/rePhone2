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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  TransferStockDto,
} from './stock.dto.js';
import {
  StockCommandResponse,
  StockLevelListResponse,
  StockMovementListResponse,
} from './stock-response.dto.js';
import { StockService } from './stock.service.js';

const STOCK_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION' },
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

  @Get('stock-levels')
  @ApiOperation({ operationId: 'listBackofficeStockLevels' })
  @ApiOkResponse({ type: StockLevelListResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public listLevels(@Query() query: StockLevelListQueryDto) {
    return this.service.listLevels(query);
  }

  @Get('stock-movements')
  @ApiOperation({ operationId: 'listBackofficeStockMovements' })
  @ApiOkResponse({ type: StockMovementListResponse })
  @ApiErrorResponses(...STOCK_ERRORS)
  public listMovements(@Query() query: StockMovementListQueryDto) {
    return this.service.listMovements(query);
  }

  @Post('stock/receive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'receiveBackofficeStock' })
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
