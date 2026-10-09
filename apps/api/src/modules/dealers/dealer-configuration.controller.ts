import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { DealerCatalogService } from './dealer-catalog.service.js';
import { DealerChannelDto } from './dealer.dto.js';
import { DealerRecordResponse } from './dealer-response.dto.js';
import { DEALER_ERRORS } from './dealer.controller.js';
import { portalActor } from './dealer-portal.controller.js';

// Configuration remains readable when deployment prerequisites have not been enabled.
@ApiTags('Dealer backoffice')
@ApiBearerAuth('access-token')
@ApiErrorResponses(...DEALER_ERRORS)
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Roles('ADMIN', 'EMPLOYEE')
@Controller('backoffice/dealers/configuration')
export class DealerConfigurationController {
  public constructor(
    @Inject(DealerCatalogService) private readonly catalog: DealerCatalogService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'DealerBackofficeController_configuration' })
  @ApiOkResponse({ type: DealerRecordResponse })
  public configuration() {
    return this.catalog.configuration();
  }

  @Post()
  @HttpCode(200)
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerRecordResponse })
  public update(@Req() req: Request, @Body() input: DealerChannelDto) {
    return this.catalog.setChannel(input, portalActor(req));
  }
}
