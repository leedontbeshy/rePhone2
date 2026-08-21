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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import {
  BackofficeVoucherListQueryDto,
  CreateVoucherDto,
  PublicVoucherListQueryDto,
  UpdateVoucherDto,
  VoucherParamsDto,
  VoucherReasonDto,
  VoucherUsageListQueryDto,
} from './voucher.dto.js';
import {
  BackofficeVoucherListResponse,
  BackofficeVoucherResponse,
  PublicVoucherListResponse,
  VoucherUsageListResponse,
} from './voucher-response.dto.js';
import { VoucherService } from './voucher.service.js';

const ADMIN_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'DUPLICATE_RESOURCE or INVALID_STATE_TRANSITION' },
  { status: 429 as const, description: 'RATE_LIMITED' },
];

@ApiTags('vouchers')
@Controller('vouchers')
export class PublicVouchersController {
  public constructor(@Inject(VoucherService) private readonly service: VoucherService) {}

  @Get()
  @UseGuards(OptionalSessionGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'listPublicVouchers',
    summary: 'Discover currently active vouchers',
  })
  @ApiPublicVoucherQueries()
  @ApiOkResponse({ type: PublicVoucherListResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  )
  public list(@Query() query: PublicVoucherListQueryDto, @Req() request: Request) {
    return this.service.listPublic(query, request.auth);
  }
}

@ApiTags('backoffice-vouchers')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/vouchers')
export class BackofficeVouchersController {
  public constructor(@Inject(VoucherService) private readonly service: VoucherService) {}

  @Get()
  @ApiOperation({
    operationId: 'listBackofficeVouchers',
    summary: 'List vouchers for administration',
  })
  @ApiBackofficeVoucherQueries()
  @ApiOkResponse({ type: BackofficeVoucherListResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public list(@Query() query: BackofficeVoucherListQueryDto) {
    return this.service.listBackoffice(query);
  }

  @Post()
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createVoucher', summary: 'Create a draft voucher' })
  @ApiBody({ type: CreateVoucherDto })
  @ApiCreatedResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public create(
    @Body() input: CreateVoucherDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.create(input, auditActor(auth, request));
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getBackofficeVoucher',
    summary: 'Get one voucher with usage counts',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public get(@Param() params: VoucherParamsDto) {
    return this.service.get(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateVoucher', summary: 'Update fields allowed by voucher state' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateVoucherDto })
  @ApiOkResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public update(
    @Param() params: VoucherParamsDto,
    @Body() input: UpdateVoucherDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.update(params.id, input, auditActor(auth, request));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'activateVoucher', summary: 'Activate a draft or paused voucher' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public activate(
    @Param() params: VoucherParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.activate(params.id, auditActor(auth, request));
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'pauseVoucher', summary: 'Pause an active voucher' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: VoucherReasonDto })
  @ApiOkResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public pause(
    @Param() params: VoucherParamsDto,
    @Body() input: VoucherReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.pause(params.id, input.reason, auditActor(auth, request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'archiveVoucher', summary: 'Archive a voucher permanently' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: VoucherReasonDto })
  @ApiOkResponse({ type: BackofficeVoucherResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public archive(
    @Param() params: VoucherParamsDto,
    @Body() input: VoucherReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.archive(params.id, input.reason, auditActor(auth, request));
  }

  @Get(':id/usages')
  @ApiOperation({ operationId: 'listVoucherUsages', summary: 'List read-only voucher usages' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiVoucherUsageQueries()
  @ApiOkResponse({ type: VoucherUsageListResponse })
  @ApiErrorResponses(...ADMIN_ERRORS)
  public listUsages(@Param() params: VoucherParamsDto, @Query() query: VoucherUsageListQueryDto) {
    return this.service.listUsages(params.id, query);
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}

function ApiPublicVoucherQueries() {
  return applyDecorators(
    ApiQuery({ name: 'visibility', required: false, enum: ['PUBLIC', 'ACCOUNT_ONLY'] }),
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

function ApiBackofficeVoucherQueries() {
  return applyDecorators(
    ApiPublicVoucherQueries(),
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'],
    }),
    ApiQuery({ name: 'discountType', required: false, enum: ['FIXED', 'PERCENT'] }),
    ApiQuery({
      name: 'scopeType',
      required: false,
      enum: ['ORDER', 'PRODUCT_TYPE', 'PRODUCTS', 'VARIANTS'],
    }),
  );
}

function ApiVoucherUsageQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'status',
      required: false,
      enum: ['RESERVED', 'CONSUMED', 'RELEASED'],
    }),
    ApiQuery({ name: 'orderId', required: false, type: String, format: 'uuid' }),
    ApiQuery({ name: 'customerId', required: false, type: String, format: 'uuid' }),
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
