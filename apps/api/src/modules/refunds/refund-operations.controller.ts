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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
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
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';
import { RefundCommandService } from './refund-command.service.js';
import { RefundBankCompletionGuard } from './refund-bank-completion.guard.js';
import { RefundQueryService } from './refund-query.service.js';
import {
  BackofficeRefundListQueryDto,
  CompleteRefundDto,
  CreateRefundDto,
  RefundIdParamsDto,
  RefundOrderIdParamsDto,
  StartRefundProcessingDto,
  TerminalRefundDto,
} from './refund.dto.js';
import {
  RefundDetailResponse,
  RefundEvidenceUrlResponse,
  RefundListResponse,
} from './refund-response.dto.js';

const REFUND_QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

const REFUND_MUTATION_ERRORS = [
  ...REFUND_QUERY_ERRORS,
  {
    status: 409 as const,
    description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  },
  {
    status: 422 as const,
    description: 'REFUND_AMOUNT_EXCEEDS_PAID, EVIDENCE_REQUIRED or EVIDENCE_INVALID',
  },
];

@ApiTags('backoffice-refunds')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/refunds')
export class BackofficeRefundController {
  public constructor(
    @Inject(RefundQueryService) private readonly queries: RefundQueryService,
    @Inject(RefundCommandService) private readonly commands: RefundCommandService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeRefunds', summary: 'List refund obligations' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'method', required: false, enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] })
  @ApiQuery({ name: 'orderNumber', required: false, type: String, maxLength: 64 })
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
    enum: ['createdAt', 'amount', 'processingAt'],
    default: 'createdAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: RefundListResponse })
  @ApiErrorResponses(...REFUND_QUERY_ERRORS)
  public list(@Query() query: BackofficeRefundListQueryDto) {
    return this.queries.list(query);
  }

  @Get(':id/evidence-url')
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'getRefundEvidenceUrl',
    summary: 'Create a short-lived private refund evidence URL',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: RefundEvidenceUrlResponse })
  @ApiErrorResponses(
    ...REFUND_QUERY_ERRORS,
    { status: 422, description: 'EVIDENCE_REQUIRED' },
    { status: 503, description: 'STORAGE_UNAVAILABLE' },
  )
  public evidenceUrl(
    @Param() params: RefundIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.queries.evidenceUrl(params.id, auth, request);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeRefund', summary: 'Get refund operation detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_QUERY_ERRORS)
  public detail(@Param() params: RefundIdParamsDto) {
    return this.queries.detail(params.id);
  }

  @Post(':id/start-processing')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'startRefundProcessing',
    summary: 'Start processing a requested refund',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: StartRefundProcessingDto })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_MUTATION_ERRORS)
  public start(
    @Param() params: RefundIdParamsDto,
    @Body() input: StartRefundProcessingDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.start(params.id, input, auth, request);
  }

  @Post(':id/complete-bank-transfer')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit(['mutation', 'upload'])
  @UseGuards(RefundBankCompletionGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: MAX_PRIVATE_EVIDENCE_BYTES } }),
  )
  @ApiOperation({
    operationId: 'completeBankTransferRefund',
    summary: 'Complete a bank-transfer refund with private evidence',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'note'],
      additionalProperties: false,
      properties: {
        file: { type: 'string', format: 'binary' },
        note: { type: 'string', minLength: 5, maxLength: 500 },
      },
    },
  })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(
    ...REFUND_MUTATION_ERRORS,
    { status: 413, description: 'FILE_TOO_LARGE' },
    { status: 415, description: 'UNSUPPORTED_FILE_TYPE' },
    { status: 503, description: 'STORAGE_UNAVAILABLE' },
  )
  public completeBankTransfer(
    @Param() params: RefundIdParamsDto,
    @Body() input: CompleteRefundDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.completeBank(params.id, input, file, auth, request);
  }

  @Post(':id/complete-cash')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'completeCashRefund', summary: 'Complete a cash refund' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CompleteRefundDto })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_MUTATION_ERRORS)
  public completeCash(
    @Param() params: RefundIdParamsDto,
    @Body() input: CompleteRefundDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.completeCash(params.id, input, auth, request);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'rejectRefund', summary: 'Reject a requested refund' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: TerminalRefundDto })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_MUTATION_ERRORS)
  public reject(
    @Param() params: RefundIdParamsDto,
    @Body() input: TerminalRefundDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.reject(params.id, input, auth, request);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'cancelRefund', summary: 'Cancel a requested refund obligation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: TerminalRefundDto })
  @ApiOkResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_MUTATION_ERRORS)
  public cancel(
    @Param() params: RefundIdParamsDto,
    @Body() input: TerminalRefundDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.cancel(params.id, input, auth, request);
  }
}

@ApiTags('backoffice-order-refunds')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/orders')
export class BackofficeOrderRefundController {
  public constructor(
    @Inject(RefundCommandService) private readonly commands: RefundCommandService,
  ) {}

  @Post(':id/refunds')
  @HttpCode(HttpStatus.CREATED)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createRefund', summary: 'Create a manual refund obligation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CreateRefundDto })
  @ApiCreatedResponse({ type: RefundDetailResponse })
  @ApiErrorResponses(...REFUND_MUTATION_ERRORS)
  public create(
    @Param() params: RefundOrderIdParamsDto,
    @Body() input: CreateRefundDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.create(params.id, input, auth, request);
  }
}
