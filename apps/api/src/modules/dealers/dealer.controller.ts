import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { DealerAccessGuard } from './dealer-access.guard.js';
import { DealerPermission, dealerContext, dealerAuditActor } from './dealer-context.js';
import { DealerCatalogService } from './dealer-catalog.service.js';
import { DealerOrderService } from './dealer-order.service.js';
import { DealerPaymentService } from './dealer-payment.service.js';
import { DealerRefundService } from './dealer-refund.service.js';
import {
  DealerCreateOrderDto,
  DealerIdParams,
  DealerPageQuery,
  DealerCatalogQuery,
  DealerPreviewDto,
  DealerReasonDto,
} from './dealer.dto.js';
import {
  DealerOfferResponse,
  DealerOrderCreatedResponse,
  DealerOrderResponse,
  DealerOrdersResponse,
  DealerPreviewResponse,
  DealerRecordResponse,
  DealerRecordsResponse,
} from './dealer-response.dto.js';
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';

export const DEALER_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or INVALID_CREDENTIALS' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND or ORDER_NOT_FOUND' },
  {
    status: 409 as const,
    description: 'CHECKOUT_REVIEW_REQUIRED, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 503 as const, description: 'SERVICE_UNAVAILABLE' },
];
export const DEALER_UPLOAD_SCHEMA = {
  type: 'object' as const,
  required: ['file'],
  properties: { file: { type: 'string' as const, format: 'binary' } },
};

@ApiTags('Dealer commerce')
@ApiBearerAuth('access-token')
@ApiSecurity('dealerApiKey')
@ApiErrorResponses(...DEALER_ERRORS)
@UseGuards(DealerAccessGuard)
@Controller('dealer')
export class DealerController {
  public constructor(
    @Inject(DealerCatalogService) private readonly catalog: DealerCatalogService,
    @Inject(DealerOrderService) private readonly orders: DealerOrderService,
    @Inject(DealerPaymentService) private readonly payments: DealerPaymentService,
    @Inject(DealerRefundService) private readonly refunds: DealerRefundService,
  ) {}

  @Get('catalog')
  @DealerPermission({ scope: 'catalog:read', capability: 'CATALOG_READ' })
  @ApiOkResponse({ type: DealerOfferResponse })
  public listCatalog(@Query() query: DealerCatalogQuery) {
    return this.catalog.list(query);
  }

  @Post('orders/preview')
  @HttpCode(200)
  @DealerPermission({ scope: 'orders:write', capability: 'CREATE_ORDER' })
  @ApiOkResponse({ type: DealerPreviewResponse })
  public preview(@Req() request: Request, @Body() input: DealerPreviewDto) {
    return this.catalog.preview(dealerContext(request).dealerId, input);
  }

  @Post('orders')
  @DealerPermission({ scope: 'orders:write', capability: 'CREATE_ORDER' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: DealerOrderCreatedResponse })
  public create(
    @Req() request: Request,
    @Body() input: DealerCreateOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.create(dealerContext(request), input, key, dealerAuditActor(request));
  }

  @Get('orders')
  @DealerPermission({ scope: 'orders:read', capability: 'READ_EXISTING_ORDER' })
  @ApiOkResponse({ type: DealerOrdersResponse })
  public listOrders(@Req() request: Request, @Query() query: DealerPageQuery) {
    const context = dealerContext(request);
    return this.orders.list(
      context.dealerId,
      query,
      context.scopes === undefined || context.scopes.includes('payments:read'),
    );
  }

  @Get('orders/:id')
  @DealerPermission({ scope: 'orders:read', capability: 'READ_EXISTING_ORDER' })
  @ApiOkResponse({ type: DealerOrderResponse })
  public order(@Req() request: Request, @Param() params: DealerIdParams) {
    const context = dealerContext(request);
    return this.orders.get(
      params.id,
      context.dealerId,
      context.scopes === undefined || context.scopes.includes('payments:read'),
    );
  }

  @Get('orders/:id/payment-requests')
  @DealerPermission({ scope: 'payments:read', capability: 'READ_EXISTING_ORDER' })
  @ApiOkResponse({ type: DealerRecordsResponse })
  public async paymentRequests(@Req() request: Request, @Param() params: DealerIdParams) {
    return (await this.orders.get(params.id, dealerContext(request).dealerId)).paymentRequests;
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @DealerPermission({ scope: 'orders:write', capability: 'CANCEL_EXISTING_ORDER' })
  @ApiOkResponse({ type: DealerRecordResponse })
  public cancel(
    @Req() request: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.payments.cancel(
      params.id,
      input.reason,
      dealerAuditActor(request),
      dealerContext(request),
    );
  }

  @Post('payment-requests/:id/proofs')
  @DealerPermission({ scope: 'payments:write', capability: 'PAY_EXISTING_ORDER', rate: 'PROOF' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PRIVATE_EVIDENCE_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: DEALER_UPLOAD_SCHEMA })
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public submit(
    @Req() request: Request,
    @Param() params: DealerIdParams,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.payments.submit(dealerContext(request), params.id, file, dealerAuditActor(request));
  }

  @Get('refunds')
  @DealerPermission({ scope: 'payments:read', capability: 'READ_EXISTING_ORDER' })
  @ApiOkResponse({ type: DealerRecordsResponse })
  public refundList(@Req() request: Request) {
    return this.refunds.list(dealerContext(request).dealerId);
  }
}
