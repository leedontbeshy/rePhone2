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
import { requestContext } from '../../common/http/request-context.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  CustomerListQueryDto,
  UserIdParamsDto,
  UserLifecycleReasonDto,
} from './user-operations.dto.js';
import { CustomerDetailResponse, CustomerListResponse } from './user-operations-response.dto.js';
import { UserOperationsService } from './user-operations.service.js';

const CUSTOMER_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-customers')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/customers')
export class CustomerController {
  public constructor(
    @Inject(UserOperationsService) private readonly operations: UserOperationsService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeCustomers', summary: 'List safe customer accounts' })
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'SUSPENDED'] })
  @ApiQuery({ name: 'createdFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'createdTo', required: false, type: String, format: 'date-time' })
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
    enum: ['createdAt', 'lastLoginAt'],
    default: 'createdAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: CustomerListResponse })
  @ApiErrorResponses(...CUSTOMER_ERRORS)
  public list(@Query() query: CustomerListQueryDto) {
    return this.operations.listCustomers(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeCustomer', summary: 'Get safe customer detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CustomerDetailResponse })
  @ApiErrorResponses(...CUSTOMER_ERRORS)
  public detail(@Param() params: UserIdParamsDto) {
    return this.operations.getCustomer(params.id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'suspendCustomer', summary: 'Suspend a customer account' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UserLifecycleReasonDto })
  @ApiOkResponse({ type: CustomerDetailResponse })
  @ApiErrorResponses(...CUSTOMER_ERRORS)
  public suspend(
    @Param() params: UserIdParamsDto,
    @Body() input: UserLifecycleReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.suspendCustomer(params.id, input.reason, actorContext(auth, request));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'activateCustomer', summary: 'Activate a suspended customer' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UserLifecycleReasonDto })
  @ApiOkResponse({ type: CustomerDetailResponse })
  @ApiErrorResponses(...CUSTOMER_ERRORS)
  public activate(
    @Param() params: UserIdParamsDto,
    @Body() input: UserLifecycleReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.activateCustomer(params.id, input.reason, actorContext(auth, request));
  }
}

function actorContext(auth: AuthContext, request: Request) {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
