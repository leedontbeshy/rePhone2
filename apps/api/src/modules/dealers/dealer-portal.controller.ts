import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { DealerProfileService } from './dealer-profile.service.js';
import { DealerWebhookService } from './dealer-webhook.service.js';
import {
  DealerApplicationDto,
  DealerBankAccountDto,
  DealerBankTokenDto,
  DealerCreateKeyDto,
  DealerIdParams,
  DealerReauthDto,
  DealerWebhookDto,
} from './dealer.dto.js';
import { DEALER_ERRORS } from './dealer.controller.js';
import { DealerRecordResponse, DealerRecordsResponse } from './dealer-response.dto.js';
import { DealerCatalogService } from './dealer-catalog.service.js';

export function portalActor(request: Request) {
  if (request.auth === undefined) throw new ApiError('AUTH_REQUIRED');
  return { ...requestContext(request), actorUserId: request.auth.userId };
}

@ApiTags('Dealer portal')
@ApiBearerAuth('access-token')
@ApiErrorResponses(...DEALER_ERRORS)
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Roles('CUSTOMER')
@Controller('dealer-portal')
export class DealerPortalController {
  public constructor(
    @Inject(DealerProfileService) private readonly profiles: DealerProfileService,
    @Inject(DealerWebhookService) private readonly webhooks: DealerWebhookService,
    @Inject(DealerCatalogService) private readonly catalog: DealerCatalogService,
  ) {}
  @Get('profile')
  @ApiOkResponse({ type: DealerRecordResponse })
  public profile(@Req() request: Request) {
    return this.profiles.own(portalActor(request).actorUserId);
  }

  @Get('configuration')
  @ApiOkResponse({ type: DealerRecordResponse })
  public configuration() {
    return this.catalog
      .configuration()
      .then(({ enabled, open, environment, termsVersion, connection }) => ({
        enabled,
        open,
        environment,
        termsVersion,
        connection,
      }));
  }

  @Post('application')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public apply(@Req() request: Request, @Body() input: DealerApplicationDto) {
    return this.profiles.apply(input, portalActor(request));
  }

  @Post('bank-accounts')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public requestBank(@Req() request: Request, @Body() input: DealerBankAccountDto) {
    return this.profiles.requestBank(input, portalActor(request));
  }

  @Post('bank-accounts/confirm')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public confirmBank(@Req() request: Request, @Body() input: DealerBankTokenDto) {
    return this.profiles.confirmBank(input.token, portalActor(request));
  }

  @Post('bank-accounts/:id/resend-confirmation')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public resendBankConfirmation(
    @Req() request: Request,
    @Param() params: DealerIdParams,
    @Body() input: DealerReauthDto,
  ) {
    return this.profiles.resendBankConfirmation(
      params.id,
      input.currentPassword,
      portalActor(request),
    );
  }

  @Post('api-keys')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public createKey(@Req() request: Request, @Body() input: DealerCreateKeyDto) {
    return this.profiles.createKey(input, portalActor(request));
  }

  @Post('api-keys/:id/revoke')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public revokeKey(@Req() request: Request, @Param() params: DealerIdParams) {
    return this.profiles.revokeKey(params.id, portalActor(request));
  }

  @Get('webhooks')
  @ApiOkResponse({ type: DealerRecordsResponse })
  public webhookHistory(@Req() request: Request) {
    return this.webhooks.history(portalActor(request).actorUserId);
  }

  @Post('webhooks')
  @BackofficeRateLimit('mutation')
  @ApiCreatedResponse({ type: DealerRecordResponse })
  public configureWebhook(@Req() request: Request, @Body() input: DealerWebhookDto) {
    return this.webhooks.configure(input, portalActor(request));
  }

  @Post('webhooks/test')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public webhookTest(@Req() request: Request) {
    return this.webhooks.test(portalActor(request));
  }

  @Post('webhooks/:id/disable')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public disableWebhook(@Req() request: Request, @Param() params: DealerIdParams) {
    return this.webhooks.disable(params.id, portalActor(request));
  }

  @Post('webhook-deliveries/:id/replay')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public replayWebhook(@Req() request: Request, @Param() params: DealerIdParams) {
    return this.webhooks.replay(params.id, portalActor(request));
  }
}
