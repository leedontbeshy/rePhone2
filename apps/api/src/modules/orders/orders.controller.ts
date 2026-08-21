import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  CheckoutPreviewRequestDto,
  CancelOrderDto,
  CreateCheckoutRequestDto,
  OrderListQueryDto,
  OrderNumberParamsDto,
} from './order.dto.js';
import { OrderRateLimit } from './order-rate-limit.decorator.js';
import { OrderRateLimitGuard } from './order-rate-limit.guard.js';
import { OrderMutationCsrfGuard } from './order-mutation-csrf.guard.js';
import {
  CheckoutPreviewResponse,
  CheckoutResultResponse,
  OrderDetailResponse,
  OrderListResponse,
} from './order-response.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('checkout')
@Controller('checkouts')
export class CheckoutsController {
  public constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, OrderRateLimitGuard)
  @OrderRateLimit('PREVIEW')
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'previewCheckout', summary: 'Preview checkout without writes' })
  @ApiBody({ type: CheckoutPreviewRequestDto })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 for guest cookie requests; not required for Bearer.',
  })
  @ApiOkResponse({ type: CheckoutPreviewResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    {
      status: 409,
      description: 'CART_NOT_FULFILLABLE, INVENTORY_NOT_AVAILABLE or VOUCHER_USAGE_LIMIT_REACHED',
    },
    { status: 422, description: 'CART_EMPTY or VOUCHER_NOT_APPLICABLE' },
    { status: 429, description: 'RATE_LIMITED' },
    { status: 503, description: 'SERVICE_UNAVAILABLE' },
  )
  public async preview(
    @Req() request: Request,
    @Body() input: CheckoutPreviewRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.orders.preview(request, input);
  }

  @Post()
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, OrderRateLimitGuard)
  @OrderRateLimit('CREATE')
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'createCheckout', summary: 'Create one atomic order from the cart' })
  @ApiBody({ type: CreateCheckoutRequestDto })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 for guest cookie requests; not required for Bearer.',
  })
  @ApiCreatedResponse({ type: CheckoutResultResponse, description: 'First successful checkout' })
  @ApiOkResponse({ type: CheckoutResultResponse, description: 'Idempotent source-cart replay' })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    {
      status: 409,
      description:
        'CHECKOUT_REVIEW_REQUIRED, CART_NOT_ACTIVE, CART_NOT_FULFILLABLE, INVENTORY_NOT_AVAILABLE, VOUCHER_USAGE_LIMIT_REACHED or CONCURRENT_MODIFICATION',
    },
    { status: 422, description: 'CART_EMPTY or VOUCHER_NOT_APPLICABLE' },
    { status: 429, description: 'RATE_LIMITED' },
    { status: 503, description: 'SERVICE_UNAVAILABLE' },
  )
  public async create(
    @Req() request: Request,
    @Body() input: CreateCheckoutRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.orders.create(request, input);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    response.setHeader('Cache-Control', 'no-store');
    return result.result;
  }
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  public constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth('access-token')
  @ApiOperation({ operationId: 'listCustomerOrders', summary: 'List owned customer orders' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'fulfillmentType', required: false, enum: ['PICKUP', 'SHIPPING'] })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['placedAt', 'grandTotal', 'status'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ type: OrderListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: OrderListQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.orders.list(auth, query);
  }

  @Get(':orderNumber')
  @UseGuards(OptionalSessionGuard, OrderRateLimitGuard)
  @OrderRateLimit('GUEST_ORDER')
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'getCustomerOrder', summary: 'Get one owned order snapshot' })
  @ApiParam({ name: 'orderNumber', type: String, example: 'RPH-20260821-23456789' })
  @ApiHeader({
    name: 'X-Guest-Order-Token',
    required: false,
    description: 'Raw guest token returned once by checkout create.',
  })
  @ApiOkResponse({ type: OrderDetailResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'ORDER_NOT_FOUND' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async detail(
    @Req() request: Request,
    @Param() params: OrderNumberParamsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.orders.detail(request, params.orderNumber);
  }

  @Post(':orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalSessionGuard, OrderMutationCsrfGuard, OrderRateLimitGuard)
  @OrderRateLimit('GUEST_ORDER')
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'cancelCustomerOrder', summary: 'Cancel one owned order' })
  @ApiParam({ name: 'orderNumber', type: String, example: 'RPH-20260821-23456789' })
  @ApiBody({ type: CancelOrderDto })
  @ApiHeader({
    name: 'X-Guest-Order-Token',
    required: false,
    description: 'Guest header-token authentication does not rely on cookies.',
  })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 only when authenticating by guest cart cookie.',
  })
  @ApiOkResponse({ type: OrderDetailResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    { status: 404, description: 'ORDER_NOT_FOUND' },
    { status: 409, description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async cancel(
    @Req() request: Request,
    @Param() params: OrderNumberParamsDto,
    @Body() input: CancelOrderDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.orders.cancel(request, params.orderNumber, input.reason);
  }
}
