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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { GuestOrderMutationCsrfGuard } from '../order-transaction-ports/guest-order-mutation-csrf.guard.js';
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';
import { AfterSalesAttachmentAccessGuard } from './after-sales-attachment-access.guard.js';
import { AfterSalesAttachmentService } from './after-sales-attachment.service.js';
import { AfterSalesCommandService } from './after-sales-command.service.js';
import {
  AfterSalesAttachmentParamsDto,
  AfterSalesRequestNumberParamsDto,
  CancelAfterSalesRequestDto,
  CreateAfterSalesRequestDto,
  CustomerAfterSalesListQueryDto,
} from './after-sales.dto.js';
import { AfterSalesQueryService } from './after-sales-query.service.js';
import { AfterSalesRateLimitGuard } from './after-sales-rate-limit.guard.js';
import {
  AfterSalesAttachmentCollectionResponse,
  AfterSalesAttachmentUrlResponse,
  AfterSalesDetailResponse,
  AfterSalesListResponse,
} from './after-sales-response.dto.js';

const PUBLIC_QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 429 as const, description: 'RATE_LIMITED' },
];

const PUBLIC_MUTATION_ERRORS = [
  ...PUBLIC_QUERY_ERRORS,
  {
    status: 409 as const,
    description:
      'AFTER_SALES_REQUEST_ALREADY_OPEN, INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION',
  },
  {
    status: 422 as const,
    description: 'WARRANTY_NOT_ACTIVE, EVIDENCE_REQUIRED or EVIDENCE_INVALID',
  },
];

@ApiTags('AfterSales')
@Controller('after-sales')
export class AfterSalesController {
  public constructor(
    @Inject(AfterSalesQueryService) private readonly queries: AfterSalesQueryService,
    @Inject(AfterSalesCommandService) private readonly commands: AfterSalesCommandService,
    @Inject(AfterSalesAttachmentService)
    private readonly attachments: AfterSalesAttachmentService,
  ) {}

  @Get()
  @Roles('CUSTOMER')
  @UseGuards(SessionGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'listCustomerAfterSalesRequests',
    summary: 'List owned after-sales requests',
  })
  @ApiAfterSalesListQueries()
  @ApiOkResponse({ type: AfterSalesListResponse })
  @ApiErrorResponses(...PUBLIC_QUERY_ERRORS)
  public list(@CurrentAuth() auth: AuthContext, @Query() query: CustomerAfterSalesListQueryDto) {
    return this.queries.listCustomer(auth.userId, query);
  }

  @Post()
  @UseGuards(OptionalSessionGuard, GuestOrderMutationCsrfGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({
    operationId: 'createAfterSalesRequest',
    summary: 'Create an after-sales request',
  })
  @ApiGuestOrderHeaders(false)
  @ApiBody({ type: CreateAfterSalesRequestDto })
  @ApiCreatedResponse({ type: AfterSalesDetailResponse })
  @ApiErrorResponses(...PUBLIC_MUTATION_ERRORS)
  public create(@Req() request: Request, @Body() input: CreateAfterSalesRequestDto) {
    return this.commands.create(request, input);
  }

  @Get(':requestNumber/attachments/:attachmentId/url')
  @UseGuards(OptionalSessionGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({
    operationId: 'getAfterSalesAttachmentUrl',
    summary: 'Create a short-lived URL for one owned attachment',
  })
  @ApiGuestOrderHeaders(true)
  @ApiParam({ name: 'requestNumber', type: String })
  @ApiParam({ name: 'attachmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AfterSalesAttachmentUrlResponse })
  @ApiErrorResponses(...PUBLIC_QUERY_ERRORS, { status: 503, description: 'STORAGE_UNAVAILABLE' })
  public attachmentUrl(@Req() request: Request, @Param() params: AfterSalesAttachmentParamsDto) {
    return this.queries.attachmentUrl(request, params.requestNumber, params.attachmentId);
  }

  @Get(':requestNumber')
  @UseGuards(OptionalSessionGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({
    operationId: 'getAfterSalesRequest',
    summary: 'Get one owned after-sales request',
  })
  @ApiGuestOrderHeaders(true)
  @ApiParam({ name: 'requestNumber', type: String })
  @ApiOkResponse({ type: AfterSalesDetailResponse })
  @ApiErrorResponses(...PUBLIC_QUERY_ERRORS)
  public detail(@Req() request: Request, @Param() params: AfterSalesRequestNumberParamsDto) {
    return this.queries.detail(request, params.requestNumber);
  }

  @Post(':requestNumber/attachments')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OptionalSessionGuard,
    AfterSalesRateLimitGuard,
    GuestOrderMutationCsrfGuard,
    AfterSalesAttachmentAccessGuard,
  )
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: MAX_PRIVATE_EVIDENCE_BYTES } }),
  )
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({
    operationId: 'uploadAfterSalesAttachment',
    summary: 'Upload one private attachment to an owned request',
  })
  @ApiGuestOrderHeaders(false)
  @ApiParam({ name: 'requestNumber', type: String })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      additionalProperties: false,
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: AfterSalesAttachmentCollectionResponse })
  @ApiErrorResponses(
    ...PUBLIC_MUTATION_ERRORS,
    { status: 413, description: 'FILE_TOO_LARGE' },
    { status: 415, description: 'UNSUPPORTED_FILE_TYPE' },
    { status: 503, description: 'STORAGE_UNAVAILABLE' },
  )
  public uploadAttachment(
    @Req() request: Request,
    @Param() params: AfterSalesRequestNumberParamsDto,
    @Body() input: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (Object.keys(input).length > 0) throw new ApiError('VALIDATION_FAILED');
    return this.attachments.upload(request, params.requestNumber, file);
  }

  @Post(':requestNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalSessionGuard, GuestOrderMutationCsrfGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('guestOrderToken')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'cancelAfterSalesRequest', summary: 'Cancel a requested case' })
  @ApiGuestOrderHeaders(false)
  @ApiParam({ name: 'requestNumber', type: String })
  @ApiBody({ type: CancelAfterSalesRequestDto })
  @ApiOkResponse({ type: AfterSalesDetailResponse })
  @ApiErrorResponses(...PUBLIC_MUTATION_ERRORS)
  public cancel(
    @Req() request: Request,
    @Param() params: AfterSalesRequestNumberParamsDto,
    @Body() input: CancelAfterSalesRequestDto,
  ) {
    return this.commands.cancel(request, params.requestNumber, input.reason);
  }
}

function ApiAfterSalesListQueries() {
  return applyDecorators(
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

function ApiGuestOrderHeaders(readOnly: boolean) {
  const decorators = [
    ApiHeader({
      name: 'X-Guest-Order-Token',
      required: false,
      description: 'Guest credential for the completed Order; Bearer has precedence.',
    }),
  ];
  if (!readOnly) {
    decorators.push(
      ApiHeader({
        name: 'X-Rephone-CSRF',
        required: false,
        description: 'Required with value 1 only for converted guest cart-cookie authentication.',
      }),
    );
  }
  return applyDecorators(...decorators);
}
