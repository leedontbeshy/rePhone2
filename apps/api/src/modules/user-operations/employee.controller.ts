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
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  CreateEmployeeDto,
  EmployeeListQueryDto,
  UpdateEmployeeDto,
  UserIdParamsDto,
  UserLifecycleReasonDto,
} from './user-operations.dto.js';
import {
  EmployeeCreateResponse,
  EmployeeDetailResponse,
  EmployeeListResponse,
  InvitationDeliveryResponse,
} from './user-operations-response.dto.js';
import { UserOperationsService } from './user-operations.service.js';

const EMPLOYEE_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description: 'DUPLICATE_RESOURCE, INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-employees')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/employees')
export class EmployeeController {
  public constructor(
    @Inject(UserOperationsService) private readonly operations: UserOperationsService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeEmployees', summary: 'List employee accounts' })
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED'],
  })
  @ApiQuery({ name: 'hiredFrom', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'hiredTo', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt'], default: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: EmployeeListResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public list(@Query() query: EmployeeListQueryDto) {
    return this.operations.listEmployees(query);
  }

  @Post()
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createBackofficeEmployee', summary: 'Invite a new employee' })
  @ApiBody({ type: CreateEmployeeDto })
  @ApiCreatedResponse({ type: EmployeeCreateResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public create(
    @Body() input: CreateEmployeeDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.createEmployee(input, actorContext(auth, request));
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeEmployee', summary: 'Get employee detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: EmployeeDetailResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public detail(@Param() params: UserIdParamsDto) {
    return this.operations.getEmployee(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeEmployee', summary: 'Update employee profile' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiOkResponse({ type: EmployeeDetailResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public update(
    @Param() params: UserIdParamsDto,
    @Body() input: UpdateEmployeeDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.updateEmployee(params.id, input, actorContext(auth, request));
  }

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'resendEmployeeInvitation', summary: 'Replace employee invitation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InvitationDeliveryResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public resend(
    @Param() params: UserIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resendInvitation(params.id, actorContext(auth, request));
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'disableEmployee', summary: 'Disable an employee account' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UserLifecycleReasonDto })
  @ApiOkResponse({ type: EmployeeDetailResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public disable(
    @Param() params: UserIdParamsDto,
    @Body() input: UserLifecycleReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.disableEmployee(params.id, input.reason, actorContext(auth, request));
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'enableEmployee', summary: 'Enable an employee account' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UserLifecycleReasonDto })
  @ApiOkResponse({ type: EmployeeDetailResponse })
  @ApiErrorResponses(...EMPLOYEE_ERRORS)
  public enable(
    @Param() params: UserIdParamsDto,
    @Body() input: UserLifecycleReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.enableEmployee(params.id, input.reason, actorContext(auth, request));
  }
}

function actorContext(auth: AuthContext, request: Request) {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
