import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  BackofficeOrderIdParamsDto,
  CreateShipmentDto,
  OverrideShippingFeeDto,
} from './fulfillment.dto.js';
import {
  BackofficeOrderDetailResponse,
  BackofficeOrderShipmentResponse,
} from './fulfillment-response.dto.js';
import { ShipmentPreparationService } from './shipment-preparation.service.js';
import { ShippingFeeOverrideService } from './shipping-fee-override.service.js';

const SHIPPING_ORDER_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description:
      'DUPLICATE_RESOURCE, INVALID_STATE_TRANSITION, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-orders')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/orders')
export class ShippingOrderController {
  public constructor(
    @Inject(ShippingFeeOverrideService)
    private readonly feeOverrides: ShippingFeeOverrideService,
    @Inject(ShipmentPreparationService)
    private readonly shipments: ShipmentPreparationService,
  ) {}

  @Post(':id/override-shipping-fee')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'overrideShippingFee' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: OverrideShippingFeeDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...SHIPPING_ORDER_ERRORS)
  public overrideShippingFee(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: OverrideShippingFeeDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.feeOverrides.override(params.id, input, auth, request);
  }

  @Post(':id/shipment')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createShipment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CreateShipmentDto })
  @ApiCreatedResponse({ type: BackofficeOrderShipmentResponse })
  @ApiOkResponse({ type: BackofficeOrderShipmentResponse, description: 'Exact replay' })
  @ApiErrorResponses(...SHIPPING_ORDER_ERRORS)
  public async createShipment(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: CreateShipmentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.shipments.create(params.id, input, auth, request);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.shipment;
  }
}
