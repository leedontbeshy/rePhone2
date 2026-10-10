import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
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
import { DealerAccessGuard } from './dealer-access.guard.js';
import { DealerPermission, dealerAuditActor, dealerContext } from './dealer-context.js';
import { DealerAfterSalesService } from './dealer-after-sales.service.js';
import { CreateAfterSalesRequestDto } from '../after-sales/after-sales.dto.js';
import { DealerIdParams, DealerReasonDto, DealerAttachmentParams } from './dealer.dto.js';
import { DealerRecordResponse, DealerRecordsResponse } from './dealer-response.dto.js';
import { MAX_PRIVATE_EVIDENCE_BYTES } from '../storage/private-evidence.validator.js';
import { DEALER_UPLOAD_SCHEMA } from './dealer.controller.js';

@ApiTags('Dealer after sales')
@ApiBearerAuth('access-token')
@ApiSecurity('dealerApiKey')
@UseGuards(DealerAccessGuard)
@Controller('dealer')
export class DealerAfterSalesController {
  public constructor(
    @Inject(DealerAfterSalesService) private readonly service: DealerAfterSalesService,
  ) {}

  @Get('after-sales')
  @DealerPermission({ scope: 'after-sales:read', capability: 'AFTER_SALES' })
  @ApiOkResponse({ type: DealerRecordsResponse })
  public listCases(@Req() req: Request) {
    return this.service.list(dealerContext(req).dealerId);
  }
  @Post('after-sales')
  @DealerPermission({ scope: 'after-sales:write', capability: 'AFTER_SALES' })
  @ApiCreatedResponse({ type: DealerRecordResponse })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public createCase(
    @Req() req: Request,
    @Body() input: CreateAfterSalesRequestDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(input, dealerAuditActor(req), dealerContext(req), key);
  }
  @Get('after-sales/:id')
  @DealerPermission({ scope: 'after-sales:read', capability: 'AFTER_SALES' })
  @ApiOkResponse({ type: DealerRecordResponse })
  public getCase(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.service.detail(params.id, dealerContext(req).dealerId);
  }
  @Post('after-sales/:id/cancel')
  @HttpCode(200)
  @DealerPermission({ scope: 'after-sales:write', capability: 'AFTER_SALES' })
  @ApiOkResponse({ type: DealerRecordResponse })
  public cancelCase(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReasonDto,
  ) {
    return this.service.cancel(params.id, input.reason, dealerContext(req), dealerAuditActor(req));
  }
  @Post('after-sales/:id/attachments')
  @DealerPermission({ scope: 'after-sales:write', capability: 'AFTER_SALES', rate: 'PROOF' })
  @ApiCreatedResponse({ type: DealerRecordResponse })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PRIVATE_EVIDENCE_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: DEALER_UPLOAD_SCHEMA })
  public attachCase(
    @Req() req: Request,
    @Param() params: DealerIdParams,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.attach(params.id, dealerContext(req), file, dealerAuditActor(req));
  }
  @Get('orders/:id/warranties')
  @DealerPermission({ scope: 'after-sales:read', capability: 'AFTER_SALES' })
  @ApiOkResponse({ type: DealerRecordsResponse })
  public warranties(@Req() req: Request, @Param() params: DealerIdParams) {
    return this.service.warranties(params.id, dealerContext(req).dealerId);
  }

  @Get('after-sales/:id/attachments/:attachmentId')
  @DealerPermission({ scope: 'after-sales:read', capability: 'AFTER_SALES' })
  @ApiOkResponse({ type: DealerRecordResponse })
  public attachment(@Req() req: Request, @Param() params: DealerAttachmentParams) {
    return this.service.attachment(
      params.id,
      params.attachmentId,
      dealerContext(req).dealerId,
      dealerAuditActor(req),
    );
  }
}
