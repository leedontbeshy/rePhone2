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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CancelBackofficeOrderDto } from '../order-cancellation/order-cancellation.dto.js';
import { BackofficeOrderService } from './backoffice-order.service.js';
import {
  BackofficeOrderIdParamsDto,
  BackofficeOrderListQueryDto,
  UpdateBackofficeOrderInternalNoteDto,
} from './fulfillment.dto.js';
import {
  BackofficeOrderDetailResponse,
  BackofficeOrderListResponse,
} from './fulfillment-response.dto.js';
import { FulfillmentQueryService } from './fulfillment-query.service.js';

const BACKOFFICE_ORDER_QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'CONCURRENT_MODIFICATION' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-orders')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/orders')
export class BackofficeOrderController {
  public constructor(
    @Inject(FulfillmentQueryService) private readonly queries: FulfillmentQueryService,
    @Inject(BackofficeOrderService) private readonly commands: BackofficeOrderService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeOrders', summary: 'List operational orders' })
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'],
  })
  @ApiQuery({
    name: 'fulfillmentStatus',
    required: false,
    enum: [
      'PENDING',
      'PREPARING',
      'READY',
      'IN_TRANSIT',
      'COMPLETED',
      'FAILED',
      'RETURNED',
      'CANCELLED',
    ],
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  })
  @ApiQuery({ name: 'fulfillmentType', required: false, enum: ['PICKUP', 'SHIPPING'] })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'placedFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'placedTo', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'pickupOverdue', required: false, type: Boolean })
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
    enum: ['placedAt', 'updatedAt', 'grandTotal', 'pickupHoldUntil'],
    default: 'placedAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: BackofficeOrderListResponse })
  @ApiErrorResponses(...BACKOFFICE_ORDER_QUERY_ERRORS)
  public list(@Query() query: BackofficeOrderListQueryDto) {
    return this.queries.list(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeOrder', summary: 'Get operational order detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_ORDER_QUERY_ERRORS)
  public detail(@Param() params: BackofficeOrderIdParamsDto) {
    return this.queries.detail(params.id);
  }

  @Patch(':id/internal-note')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeOrderInternalNote' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateBackofficeOrderInternalNoteDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_ORDER_QUERY_ERRORS)
  public updateInternalNote(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: UpdateBackofficeOrderInternalNoteDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.updateInternalNote(params.id, input, auth, request);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'cancelBackofficeOrder', summary: 'Cancel an eligible order' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CancelBackofficeOrderDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_ORDER_QUERY_ERRORS, {
    status: 409,
    description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  })
  public cancel(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: CancelBackofficeOrderDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.cancel(params.id, input.reason, auth, request);
  }
}
