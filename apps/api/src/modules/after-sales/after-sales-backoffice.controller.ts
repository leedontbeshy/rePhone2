import {
  applyDecorators,
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
import { ApiError } from '../../common/errors/api-error.js';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AfterSalesBackofficeQueryService } from './after-sales-backoffice-query.service.js';
import {
  BackofficeAfterSalesDetailResponse,
  BackofficeAfterSalesListResponse,
} from './after-sales-backoffice-response.dto.js';
import { AfterSalesBackofficeService } from './after-sales-backoffice.service.js';
import {
  AfterSalesIdParamsDto,
  ApproveAfterSalesRequestDto,
  AssignAfterSalesRequestDto,
  BackofficeAfterSalesAttachmentParamsDto,
  BackofficeAfterSalesListQueryDto,
  ReceiveAfterSalesRequestDto,
  RecordAfterSalesInspectionSummaryDto,
  RejectAfterSalesRequestDto,
  ResolveAfterSalesDto,
  ResolveAfterSalesRefundedDto,
  ResolveAfterSalesReplacedDto,
} from './after-sales.dto.js';
import { AfterSalesAttachmentUrlResponse } from './after-sales-response.dto.js';

const QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

const MUTATION_ERRORS = [
  ...QUERY_ERRORS,
  {
    status: 409 as const,
    description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  },
  {
    status: 422 as const,
    description: 'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET or INVENTORY_NOT_AVAILABLE',
  },
];

@ApiTags('Backoffice AfterSales')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/after-sales')
export class BackofficeAfterSalesController {
  public constructor(
    @Inject(AfterSalesBackofficeQueryService)
    private readonly queries: AfterSalesBackofficeQueryService,
    @Inject(AfterSalesBackofficeService)
    private readonly operations: AfterSalesBackofficeService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listBackofficeAfterSalesRequests',
    summary: 'List after-sales cases',
  })
  @ApiAfterSalesBackofficeQueries()
  @ApiOkResponse({ type: BackofficeAfterSalesListResponse })
  @ApiErrorResponses(...QUERY_ERRORS)
  public list(@Query() query: BackofficeAfterSalesListQueryDto) {
    return this.queries.list(query);
  }

  @Get(':id/attachments/:attachmentId/url')
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'getBackofficeAfterSalesAttachmentUrl',
    summary: 'Create a short-lived URL for a private case attachment',
  })
  @ApiUuidParam()
  @ApiParam({ name: 'attachmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AfterSalesAttachmentUrlResponse })
  @ApiErrorResponses(...QUERY_ERRORS, { status: 503, description: 'STORAGE_UNAVAILABLE' })
  public attachmentUrl(
    @Param() params: BackofficeAfterSalesAttachmentParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.queries.attachmentUrl(params.id, params.attachmentId, auditActor(auth, request));
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getBackofficeAfterSalesRequest',
    summary: 'Get an after-sales case',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...QUERY_ERRORS)
  public detail(@Param() params: AfterSalesIdParamsDto, @CurrentAuth() auth: AuthContext) {
    return this.queries.detail(params.id, staffRole(auth));
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'assignAfterSalesRequest', summary: 'Assign or unassign a case' })
  @ApiUuidParam()
  @ApiBody({ type: AssignAfterSalesRequestDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public assign(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: AssignAfterSalesRequestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.assign(params.id, input, auditActor(auth, request), staffRole(auth));
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'receiveAfterSalesRequest', summary: 'Receive an after-sales item' })
  @ApiUuidParam()
  @ApiBody({ type: ReceiveAfterSalesRequestDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public receive(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ReceiveAfterSalesRequestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.receive(params.id, input, auditActor(auth, request), staffRole(auth));
  }

  @Post(':id/start-inspection')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'startAfterSalesInspection', summary: 'Start case inspection' })
  @ApiUuidParam()
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public startInspection(
    @Param() params: AfterSalesIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.startInspection(params.id, auditActor(auth, request), staffRole(auth));
  }

  @Post(':id/record-inspection-summary')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'recordAfterSalesInspectionSummary',
    summary: 'Record an accessory inspection summary',
  })
  @ApiUuidParam()
  @ApiBody({ type: RecordAfterSalesInspectionSummaryDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public recordInspectionSummary(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: RecordAfterSalesInspectionSummaryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.recordInspectionSummary(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'approveAfterSalesRequest', summary: 'Approve an inspected case' })
  @ApiUuidParam()
  @ApiBody({ type: ApproveAfterSalesRequestDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public approve(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ApproveAfterSalesRequestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.approve(params.id, input, auditActor(auth, request), staffRole(auth));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'rejectAfterSalesRequest', summary: 'Reject an inspected case' })
  @ApiUuidParam()
  @ApiBody({ type: RejectAfterSalesRequestDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public reject(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: RejectAfterSalesRequestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.reject(params.id, input, auditActor(auth, request), staffRole(auth));
  }

  @Post(':id/resolve-repaired')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'resolveAfterSalesRepaired', summary: 'Resolve a repaired case' })
  @ApiUuidParam()
  @ApiBody({ type: ResolveAfterSalesDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public resolveRepaired(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ResolveAfterSalesDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resolveRepaired(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }

  @Post(':id/resolve-replaced')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'resolveAfterSalesReplaced',
    summary: 'Resolve an iPhone replacement',
  })
  @ApiUuidParam()
  @ApiBody({ type: ResolveAfterSalesReplacedDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public resolveReplaced(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ResolveAfterSalesReplacedDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resolveReplaced(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }

  @Post(':id/resolve-refunded')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'resolveAfterSalesRefunded',
    summary: 'Link a completed refund resolution',
  })
  @ApiUuidParam()
  @ApiBody({ type: ResolveAfterSalesRefundedDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public resolveRefunded(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ResolveAfterSalesRefundedDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resolveRefunded(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }

  @Post(':id/resolve-returned-unchanged')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'resolveAfterSalesReturnedUnchanged',
    summary: 'Return the inspected item unchanged',
  })
  @ApiUuidParam()
  @ApiBody({ type: ResolveAfterSalesDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public resolveReturnedUnchanged(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ResolveAfterSalesDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resolveReturnedUnchanged(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }

  @Post(':id/resolve-other')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'resolveAfterSalesOther',
    summary: 'Resolve with an admin-defined outcome',
  })
  @ApiUuidParam()
  @ApiBody({ type: ResolveAfterSalesDto })
  @ApiOkResponse({ type: BackofficeAfterSalesDetailResponse })
  @ApiErrorResponses(...MUTATION_ERRORS)
  public resolveOther(
    @Param() params: AfterSalesIdParamsDto,
    @Body() input: ResolveAfterSalesDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.resolveOther(
      params.id,
      input,
      auditActor(auth, request),
      staffRole(auth),
    );
  }
}

function ApiUuidParam() {
  return ApiParam({ name: 'id', type: String, format: 'uuid' });
}

function ApiAfterSalesBackofficeQueries() {
  return applyDecorators(
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 255 }),
    ApiQuery({ name: 'type', required: false, enum: ['WARRANTY', 'RETURN', 'EXCHANGE'] }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: [
        'REQUESTED',
        'RECEIVED',
        'INSPECTING',
        'APPROVED',
        'REJECTED',
        'RESOLVED',
        'CANCELLED',
      ],
    }),
    ApiQuery({ name: 'assignedToId', required: false, type: String, format: 'uuid' }),
    ApiQuery({ name: 'createdFrom', required: false, type: String, format: 'date-time' }),
    ApiQuery({ name: 'createdTo', required: false, type: String, format: 'date-time' }),
    ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      type: Number,
      minimum: 1,
      maximum: 100,
      default: 20,
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      enum: ['createdAt', 'updatedAt', 'requestedAt'],
      default: 'requestedAt',
    }),
    ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' }),
  );
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}

function staffRole(auth: AuthContext): 'EMPLOYEE' | 'ADMIN' {
  if (auth.role === 'EMPLOYEE' || auth.role === 'ADMIN') return auth.role;
  throw new ApiError('FORBIDDEN');
}
