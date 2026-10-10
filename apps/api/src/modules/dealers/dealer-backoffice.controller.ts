import {
  Body,
  Controller,
  Get,
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
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';
import { DealerProfileService } from './dealer-profile.service.js';
import { DealerCatalogService } from './dealer-catalog.service.js';
import { DealerOrderService } from './dealer-order.service.js';
import { DealerPaymentService } from './dealer-payment.service.js';
import { DealerRefundService } from './dealer-refund.service.js';
import {
  DealerIdParams,
  DealerInventoryOverrideDto,
  DealerPageQuery,
  DealerPricingDto,
  DealerReasonDto,
  DealerReceiptDto,
  DealerRefundActionDto,
  DealerRefundDto,
  DealerShippingQuoteDto,
  DealerTransitionDto,
  DealerRiskDto,
  DealerRefundRebindDto,
  DealerAssessmentDto,
  DealerReturnSettlementDto,
} from './dealer.dto.js';
import { DEALER_ERRORS, DEALER_UPLOAD_SCHEMA } from './dealer.controller.js';
import {
  DealerOrderResponse,
  DealerOrdersResponse,
  DealerRecordResponse,
  DealerRecordsResponse,
} from './dealer-response.dto.js';
import { portalActor } from './dealer-portal.controller.js';
import { DealerAfterSalesService } from './dealer-after-sales.service.js';
import { CreateAfterSalesRequestDto } from '../after-sales/after-sales.dto.js';
import { DealerReconciliationService } from './dealer-reconciliation.service.js';
import { DealerCorrectionDto, DealerReconciliationResolveDto } from './dealer.dto.js';
import { Headers } from '@nestjs/common';
import { DealerEnabledGuard } from './dealer-enabled.guard.js';

@ApiTags('Dealer backoffice')
@ApiBearerAuth('access-token')
@ApiErrorResponses(...DEALER_ERRORS)
@UseGuards(SessionGuard, RolesGuard, DealerEnabledGuard, BackofficeRateLimitGuard)
@Roles('ADMIN', 'EMPLOYEE')
@Controller('backoffice/dealers')
export class DealerBackofficeController {
  public constructor(
    @Inject(DealerProfileService) private readonly profiles: DealerProfileService,
    @Inject(DealerCatalogService) private readonly catalog: DealerCatalogService,
    @Inject(DealerOrderService) private readonly orders: DealerOrderService,
    @Inject(DealerPaymentService) private readonly payments: DealerPaymentService,
    @Inject(DealerRefundService) private readonly refunds: DealerRefundService,
    @Inject(DealerAfterSalesService) private readonly afterSales: DealerAfterSalesService,
    @Inject(DealerReconciliationService)
    private readonly reconciliation: DealerReconciliationService,
  ) {}
  @Get()
  @ApiOkResponse({ type: DealerRecordResponse })
  public list(@Query() query: DealerPageQuery) {
    return this.profiles.list(query.page, query.pageSize);
  }

  @Get('pricing')
  @Roles('ADMIN')
  @ApiOkResponse({ type: DealerRecordResponse })
  public pricing() {
    return this.catalog.policy();
  }

  @Post('pricing')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public updatePricing(@Req() req: Request, @Body() input: DealerPricingDto) {
    return this.catalog.updatePolicy(input, portalActor(req));
  }

  @Post('inventory/:id/pricing')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public override(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerInventoryOverrideDto,
  ) {
    return this.catalog.override(params.id, input, portalActor(req));
  }

  @Get('inventory/:id/pricing')
  @Roles('ADMIN')
  @ApiOkResponse({ type: DealerRecordResponse })
  public inventoryPricing(@Param() params: DealerIdParams) {
    return this.catalog.inventoryPricing(params.id);
  }

  @Post('shipping-quotes')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public quote(@Req() req: Request, @Body() input: DealerShippingQuoteDto) {
    return this.catalog.quote(input, portalActor(req));
  }

  @Get('orders')
  @ApiOkResponse({ type: DealerOrdersResponse })
  public orderList(@Query() query: DealerPageQuery) {
    return this.orders.list(undefined, query);
  }

  @Get('orders/:id')
  @ApiOkResponse({ type: DealerOrderResponse })
  public order(@Param() params: DealerIdParams) {
    return this.orders.get(params.id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public cancel(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.payments.cancel(params.id, input.reason, portalActor(req));
  }

  @Post('orders/:id/return-settlement')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public settleReturn(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReturnSettlementDto,
  ) {
    return this.payments.settleReturn(params.id, input, portalActor(req));
  }

  @Get('proofs')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public proofs() {
    return this.payments.reviewQueue();
  }

  @Get('proofs/:id/evidence')
  @ApiOkResponse({ type: DealerRecordResponse })
  public proofUrl(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.payments.proofUrl(params.id, portalActor(req));
  }

  @Post('proofs/:id/reject')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public rejectProof(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.payments.reject(params.id, input.reason, portalActor(req));
  }

  @Get('receipts')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public receipts() {
    return this.payments.receipts();
  }

  @Post('receipts')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public receipt(@Req() req: Request, @Body() input: DealerReceiptDto) {
    return this.payments.record(input, portalActor(req));
  }

  @Post('receipts/:id/assign')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public assign(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() order: DealerIdParams,
  ) {
    return this.payments.assign(params.id, order.id, portalActor(req));
  }

  @Get('refunds')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public refundList() {
    return this.refunds.list();
  }

  @Post('refunds')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public refund(
    @Req() req: Request,
    @Body() input: DealerRefundDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.refunds.create(input, portalActor(req), key);
  }

  @Post('refunds/:id/actions')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public refundAction(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerRefundActionDto,
  ) {
    return this.refunds.action(params.id, input, portalActor(req));
  }

  @Get('refunds/:id/destination')
  @Roles('ADMIN')
  @ApiOkResponse({ type: DealerRecordResponse })
  public destination(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.refunds.destination(params.id, portalActor(req));
  }

  @Post('refunds/:id/rebind')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public rebindRefund(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerRefundRebindDto,
  ) {
    return this.refunds.rebind(params.id, input.id, input.reason, portalActor(req));
  }

  @Post('refunds/:id/complete')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit(['mutation', 'upload'])
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PRIVATE_EVIDENCE_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: DEALER_UPLOAD_SCHEMA })
  @ApiOkResponse({ type: DealerRecordResponse })
  public complete(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.refunds.complete(params.id, file, portalActor(req));
  }

  @Post('bank-accounts/:id/verify')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public verifyBank(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.profiles.verifyBank(params.id, portalActor(req));
  }

  @Post('bank-accounts/:id/disable')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public disableBank(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.profiles.disableBank(params.id, input.reason, portalActor(req));
  }

  @Post('after-sales/backup-intake')
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public backupIntake(
    @Req() req: Request,
    @Body() input: CreateAfterSalesRequestDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.afterSales.create(input, portalActor(req), undefined, key);
  }

  @Get('after-sales')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public cases() {
    return this.afterSales.list();
  }
  @Post('after-sales/:id/assessment')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public assessCase(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerAssessmentDto,
  ) {
    return this.afterSales.assess(params.id, input, portalActor(req));
  }

  @Get('reconciliation')
  @Roles('ADMIN')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public reconciliationList() {
    return this.reconciliation.list();
  }

  @Post('receipts/:id/corrections')
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public correction(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerCorrectionDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.reconciliation.correct(
      params.id,
      input.amount,
      input.reason,
      key,
      portalActor(req),
    );
  }

  @Post('allocations/:id/reverse')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public reverseAllocation(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.reconciliation.reverseAllocation(params.id, input.reason, portalActor(req));
  }

  @Post('reconciliation/:id/resolve')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public resolveReconciliation(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReconciliationResolveDto,
  ) {
    return this.reconciliation.resolve(
      params.id,
      input.reason,
      input.applyCorrection,
      portalActor(req),
    );
  }

  @Post('orders/:id/release-reconciliation')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public releaseReconciliation(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.reconciliation.releaseOrder(params.id, input.reason, portalActor(req));
  }

  @Get(':id')
  @ApiOkResponse({ type: DealerRecordResponse })
  public profile(@Param() params: DealerIdParams) {
    return this.profiles.get(params.id);
  }

  @Get('bank-accounts/:id/details')
  @Roles('ADMIN')
  @ApiOkResponse({ type: DealerRecordResponse })
  public bankDetails(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.profiles.bankDetails(params.id, portalActor(req));
  }

  @Post(':id/risk')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public risk(@Req() req: Request, @Param() params: DealerIdParams, @Body() input: DealerRiskDto) {
    return this.profiles.risk(params.id, input, portalActor(req));
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public transition(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerTransitionDto,
  ) {
    return this.profiles.transition(params.id, input, portalActor(req));
  }
}
