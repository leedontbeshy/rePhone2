import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { CheckoutPreviewRequestDto } from './order.dto.js';
import { OrderRateLimit } from './order-rate-limit.decorator.js';
import { OrderRateLimitGuard } from './order-rate-limit.guard.js';
import { CheckoutPreviewResponse } from './order-response.dto.js';
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
}
