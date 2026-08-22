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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MAX_PAYMENT_EVIDENCE_BYTES } from './payment-evidence.validator.js';
import {
  BackofficePaymentIdParamsDto,
  BackofficePaymentListQueryDto,
  PaymentIdParamsDto,
  RejectPaymentDto,
  VerifyPaymentDto,
} from './payment-operation.dto.js';
import {
  BackofficePaymentDetailResponse,
  BackofficePaymentListResponse,
  PaymentEvidenceUrlResponse,
  PaymentPublicResponse,
  PaymentReviewResultResponse,
} from './payment-operation-response.dto.js';
import { PaymentProofAccessGuard } from './payment-proof-access.guard.js';
import { PaymentProofCsrfGuard } from './payment-proof-csrf.guard.js';
import { PaymentProofSubmissionService } from './payment-proof-submission.service.js';
import { PaymentRateLimitGuard } from './payment-rate-limit.guard.js';
import { PaymentReviewQueryService } from './payment-review-query.service.js';
import { PaymentReviewCommandService } from './payment-review-command.service.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentOperationsController {
  public constructor(
    @Inject(PaymentProofSubmissionService)
    private readonly proofSubmission: PaymentProofSubmissionService,
  ) {}

  @Post(':paymentId/submit-proof')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OptionalSessionGuard,
    PaymentProofAccessGuard,
    PaymentProofCsrfGuard,
    PaymentRateLimitGuard,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: MAX_PAYMENT_EVIDENCE_BYTES },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'submitPaymentProof', summary: 'Submit private deposit proof' })
  @ApiParam({ name: 'paymentId', type: String, format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'X-Guest-Order-Token',
    required: false,
    description: 'Guest order credential; Bearer has precedence when present.',
  })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 only for guest cart-cookie authentication.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      additionalProperties: false,
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: PaymentPublicResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    { status: 404, description: 'ORDER_NOT_FOUND' },
    {
      status: 409,
      description:
        'PAYMENT_PROOF_DEADLINE_PASSED, PAYMENT_ALREADY_REVIEWED, INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
    },
    { status: 413, description: 'FILE_TOO_LARGE' },
    { status: 415, description: 'UNSUPPORTED_FILE_TYPE' },
    { status: 422, description: 'EVIDENCE_REQUIRED or EVIDENCE_INVALID' },
    { status: 429, description: 'RATE_LIMITED' },
    { status: 503, description: 'STORAGE_UNAVAILABLE' },
  )
  public async submitProof(
    @Req() request: Request,
    @Param() params: PaymentIdParamsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.proofSubmission.submit(request, params.paymentId, file);
  }
}

const BACKOFFICE_PAYMENT_QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 422 as const, description: 'EVIDENCE_REQUIRED' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 503 as const, description: 'STORAGE_UNAVAILABLE' },
];

@ApiTags('backoffice-payments')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/payments')
export class BackofficePaymentOperationsController {
  public constructor(
    @Inject(PaymentReviewQueryService)
    private readonly reviewQueries: PaymentReviewQueryService,
    @Inject(PaymentReviewCommandService)
    private readonly reviewCommands: PaymentReviewCommandService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficePayments', summary: 'List the payment review queue' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['AWAITING_PROOF', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'purpose', required: false, enum: ['DEPOSIT', 'BALANCE', 'FULL_PAYMENT'] })
  @ApiQuery({ name: 'method', required: false, enum: ['BANK_TRANSFER', 'CASH', 'COD', 'OTHER'] })
  @ApiQuery({ name: 'reviewOverdue', required: false, type: Boolean })
  @ApiQuery({ name: 'orderNumber', required: false, type: String })
  @ApiQuery({ name: 'submittedFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'submittedTo', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['submittedAt', 'expiresAt', 'createdAt', 'expectedAmount'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ type: BackofficePaymentListResponse })
  @ApiErrorResponses(...BACKOFFICE_PAYMENT_QUERY_ERRORS)
  public list(
    @Query() query: BackofficePaymentListQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.reviewQueries.list(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficePayment', summary: 'Get safe payment review detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficePaymentDetailResponse })
  @ApiErrorResponses(...BACKOFFICE_PAYMENT_QUERY_ERRORS)
  public detail(
    @Param() params: BackofficePaymentIdParamsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.reviewQueries.detail(params.id);
  }

  @Get(':id/evidence-url')
  @BackofficeRateLimit('mutation')
  @ApiOperation({
    operationId: 'getPaymentEvidenceUrl',
    summary: 'Create a short-lived private evidence URL',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: PaymentEvidenceUrlResponse })
  @ApiErrorResponses(...BACKOFFICE_PAYMENT_QUERY_ERRORS)
  public evidenceUrl(
    @Param() params: BackofficePaymentIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.reviewQueries.evidenceUrl(params.id, auth, request);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'verifyPayment', summary: 'Verify one submitted deposit proof' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: VerifyPaymentDto })
  @ApiOkResponse({ type: PaymentReviewResultResponse })
  @ApiErrorResponses(
    ...BACKOFFICE_PAYMENT_QUERY_ERRORS,
    {
      status: 409,
      description: 'PAYMENT_ALREADY_REVIEWED, INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
    },
    { status: 422, description: 'DEPOSIT_AMOUNT_INSUFFICIENT or VALIDATION_FAILED' },
  )
  public verify(
    @Param() params: BackofficePaymentIdParamsDto,
    @Body() input: VerifyPaymentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.reviewCommands.verify(params.id, input, auth, request);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'rejectPayment', summary: 'Reject one submitted deposit proof' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: RejectPaymentDto })
  @ApiOkResponse({ type: PaymentReviewResultResponse })
  @ApiErrorResponses(...BACKOFFICE_PAYMENT_QUERY_ERRORS, {
    status: 409,
    description: 'PAYMENT_ALREADY_REVIEWED, INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  })
  public reject(
    @Param() params: BackofficePaymentIdParamsDto,
    @Body() input: RejectPaymentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.reviewCommands.reject(params.id, input, auth, request);
  }
}
