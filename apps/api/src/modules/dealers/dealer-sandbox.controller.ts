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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { DealerRuntime } from './dealer-runtime.service.js';
import { DealerSandboxService } from './dealer-sandbox.service.js';
import { DealerIdParams, DealerSimulationDto } from './dealer.dto.js';
import { DealerOrderResponse, DealerRecordResponse } from './dealer-response.dto.js';
import { DealerEnabledGuard } from './dealer-enabled.guard.js';

@ApiTags('Dealer sandbox')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard, DealerEnabledGuard, BackofficeRateLimitGuard)
@Controller('backoffice/dealers/sandbox')
export class DealerSandboxController {
  public constructor(
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(DealerSandboxService) private readonly sandbox: DealerSandboxService,
  ) {}
  @Get('configuration')
  @ApiOkResponse({ type: DealerRecordResponse })
  public configuration() {
    return { environment: this.runtime.mode, simulationEnabled: this.runtime.mode === 'TEST' };
  }
  @Post('orders/:id/simulate')
  @HttpCode(200)
  @BackofficeRateLimit('mutation')
  @ApiOkResponse({ type: DealerOrderResponse })
  public simulate(
    @Param() params: DealerIdParams,
    @Body() input: DealerSimulationDto,
    @Req() request: Request,
  ) {
    return this.sandbox.simulate(params.id, input, request);
  }
}
