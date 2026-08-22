import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { MAX_PAYMENT_EVIDENCE_BYTES } from './payment-evidence.validator.js';
import { PaymentIdParamsDto } from './payment-operation.dto.js';
import { PaymentPublicResponse } from './payment-operation-response.dto.js';
import { PaymentProofAccessGuard } from './payment-proof-access.guard.js';
import { PaymentProofCsrfGuard } from './payment-proof-csrf.guard.js';
import { PaymentProofSubmissionService } from './payment-proof-submission.service.js';
import { PaymentRateLimitGuard } from './payment-rate-limit.guard.js';

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
