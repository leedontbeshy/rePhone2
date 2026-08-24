import {
  applyDecorators,
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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { WarrantyCommandService } from './warranty-command.service.js';
import {
  BackofficeWarrantyListQueryDto,
  CreateWarrantyPolicyDto,
  UpdateWarrantyPolicyDto,
  WarrantyCodeParamsDto,
  WarrantyIdParamsDto,
  WarrantyPaginationDto,
  WarrantyPolicyIdParamsDto,
  WarrantyPolicyListQueryDto,
  WarrantyReasonDto,
} from './warranty.dto.js';
import { WarrantyQueryService } from './warranty-query.service.js';
import {
  BackofficeWarrantyDetailResponse,
  BackofficeWarrantyListResponse,
  WarrantyDetailResponse,
  WarrantyListResponse,
  WarrantyPolicyListResponse,
  WarrantyPolicyResponse,
} from './warranty-response.dto.js';

const BACKOFFICE_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'DUPLICATE_RESOURCE or INVALID_STATE_TRANSITION' },
  { status: 429 as const, description: 'RATE_LIMITED' },
];

@ApiTags('Warranty')
@Controller('warranties')
export class CustomerWarrantiesController {
  public constructor(
    @Inject(WarrantyQueryService) private readonly queries: WarrantyQueryService,
  ) {}

  @Get()
  @Roles('CUSTOMER')
  @UseGuards(SessionGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ operationId: 'listCustomerWarranties', summary: 'List owned warranties' })
  @ApiWarrantyPagination()
  @ApiOkResponse({ type: WarrantyListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public list(@CurrentAuth() auth: AuthContext, @Query() query: WarrantyPaginationDto) {
    return this.queries.listCustomer(auth.userId, query);
  }

  @Get(':warrantyCode')
  @UseGuards(OptionalSessionGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'getCustomerWarranty', summary: 'Get one owned warranty' })
  @ApiParam({ name: 'warrantyCode', type: String })
  @ApiHeader({
    name: 'X-Guest-Order-Token',
    required: false,
    description: 'Guest credential for the Order containing this warranty.',
  })
  @ApiOkResponse({ type: WarrantyDetailResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
  )
  public detail(@Req() request: Request, @Param() params: WarrantyCodeParamsDto) {
    return this.queries.getCustomer(request, params.warrantyCode);
  }
}

@ApiTags('Warranty')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/warranty-policies')
export class BackofficeWarrantyPoliciesController {
  public constructor(
    @Inject(WarrantyQueryService) private readonly queries: WarrantyQueryService,
    @Inject(WarrantyCommandService) private readonly commands: WarrantyCommandService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listBackofficeWarrantyPolicies',
    summary: 'List warranty policies',
  })
  @ApiWarrantyPolicyQueries()
  @ApiOkResponse({ type: WarrantyPolicyListResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public list(@Query() query: WarrantyPolicyListQueryDto) {
    return this.queries.listPolicies(query);
  }

  @Post()
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createWarrantyPolicy', summary: 'Create an inactive policy' })
  @ApiBody({ type: CreateWarrantyPolicyDto })
  @ApiCreatedResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public create(
    @Body() input: CreateWarrantyPolicyDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.createPolicy(input, auditActor(auth, request));
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeWarrantyPolicy', summary: 'Get a warranty policy' })
  @ApiUuidParam()
  @ApiOkResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public detail(@Param() params: WarrantyPolicyIdParamsDto) {
    return this.queries.getPolicy(params.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'updateWarrantyPolicy',
    summary: 'Update mutable fields of a non-archived policy',
  })
  @ApiUuidParam()
  @ApiBody({ type: UpdateWarrantyPolicyDto })
  @ApiOkResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public update(
    @Param() params: WarrantyPolicyIdParamsDto,
    @Body() input: UpdateWarrantyPolicyDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.updatePolicy(params.id, input, auditActor(auth, request));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'activateWarrantyPolicy', summary: 'Activate a policy' })
  @ApiUuidParam()
  @ApiOkResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public activate(
    @Param() params: WarrantyPolicyIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.activatePolicy(params.id, auditActor(auth, request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'deactivateWarrantyPolicy', summary: 'Deactivate a policy' })
  @ApiUuidParam()
  @ApiBody({ type: WarrantyReasonDto })
  @ApiOkResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public deactivate(
    @Param() params: WarrantyPolicyIdParamsDto,
    @Body() input: WarrantyReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.deactivatePolicy(params.id, input.reason, auditActor(auth, request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'archiveWarrantyPolicy', summary: 'Archive a policy permanently' })
  @ApiUuidParam()
  @ApiBody({ type: WarrantyReasonDto })
  @ApiOkResponse({ type: WarrantyPolicyResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public archive(
    @Param() params: WarrantyPolicyIdParamsDto,
    @Body() input: WarrantyReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.archivePolicy(params.id, input.reason, auditActor(auth, request));
  }
}

@ApiTags('Warranty')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/warranties')
export class BackofficeWarrantiesController {
  public constructor(
    @Inject(WarrantyQueryService) private readonly queries: WarrantyQueryService,
    @Inject(WarrantyCommandService) private readonly commands: WarrantyCommandService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeWarranties', summary: 'List issued warranties' })
  @ApiBackofficeWarrantyQueries()
  @ApiOkResponse({ type: BackofficeWarrantyListResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public list(@Query() query: BackofficeWarrantyListQueryDto) {
    return this.queries.listBackoffice(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeWarranty', summary: 'Get an issued warranty' })
  @ApiUuidParam()
  @ApiOkResponse({ type: BackofficeWarrantyDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public detail(@Param() params: WarrantyIdParamsDto) {
    return this.queries.getBackoffice(params.id);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'voidWarranty', summary: 'Void an issued warranty' })
  @ApiUuidParam()
  @ApiBody({ type: WarrantyReasonDto })
  @ApiOkResponse({ type: BackofficeWarrantyDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_ERRORS)
  public void(
    @Param() params: WarrantyIdParamsDto,
    @Body() input: WarrantyReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.voidWarranty(params.id, input.reason, auditActor(auth, request));
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}

function ApiUuidParam() {
  return ApiParam({ name: 'id', type: String, format: 'uuid' });
}

function ApiWarrantyPagination() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      type: Number,
      minimum: 1,
      maximum: 100,
      default: 20,
    }),
  );
}

function ApiWarrantyPolicyQueries() {
  return applyDecorators(
    ApiWarrantyPagination(),
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 255 }),
    ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] }),
    ApiQuery({ name: 'archived', required: false, type: Boolean }),
  );
}

function ApiBackofficeWarrantyQueries() {
  return applyDecorators(
    ApiWarrantyPagination(),
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 255 }),
    ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'VOIDED'] }),
    ApiQuery({ name: 'validity', required: false, enum: ['VALID', 'EXPIRED', 'NOT_STARTED'] }),
    ApiQuery({ name: 'customerId', required: false, type: String, format: 'uuid' }),
  );
}
