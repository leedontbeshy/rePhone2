import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import {
  IdentifierLookupDto,
  IntakeInventoryUnitDto,
  InventoryReasonDto,
  InventoryResourceIdParamsDto,
  InventoryUnitListQueryDto,
  UpdateInventoryCostDto,
  UpdateInventoryUnitDto,
} from './inventory.dto.js';
import {
  DecryptedIdentifiersResponse,
  InventoryCostResponse,
  InventoryLocationListResponse,
  InventoryUnitListResponse,
  InventoryUnitListItemResponse,
  InventoryUnitResponse,
} from './inventory-response.dto.js';
import { InventoryService } from './inventory.service.js';

const INVENTORY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'DUPLICATE_RESOURCE or INVALID_STATE_TRANSITION' },
  { status: 422 as const, description: 'Inventory domain requirement failed' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-inventory')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/inventory-units')
export class InventoryController {
  public constructor(@Inject(InventoryService) private readonly service: InventoryService) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeInventoryUnits' })
  @ApiOkResponse({ type: InventoryUnitListResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public list(@Query() query: InventoryUnitListQueryDto) {
    return this.service.listUnits(query);
  }

  @Post('lookup-identifier')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'lookupBackofficeInventoryIdentifier' })
  @ApiOkResponse({ type: InventoryUnitListItemResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public lookup(
    @Body() input: IdentifierLookupDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.lookupIdentifier(input, auditActor(auth, request));
  }

  @Post()
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'intakeBackofficeInventoryUnit' })
  @ApiCreatedResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public intake(
    @Body() input: IntakeInventoryUnitDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.intake(input, auditActor(auth, request));
  }

  @Get(':id/cost')
  @Roles('ADMIN')
  @ApiOperation({ operationId: 'getBackofficeInventoryCost' })
  @ApiOkResponse({ type: InventoryCostResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public getCost(@Param() params: InventoryResourceIdParamsDto) {
    return this.service.getCost(params.id);
  }

  @Patch(':id/cost')
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeInventoryCost' })
  @ApiOkResponse({ type: InventoryCostResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public updateCost(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: UpdateInventoryCostDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.updateCost(params.id, input, auditActor(auth, request));
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeInventoryUnit' })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public get(@Param() params: InventoryResourceIdParamsDto) {
    return this.service.getUnit(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeInventoryUnit' })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public update(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: UpdateInventoryUnitDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.updateUnit(params.id, input, auditActor(auth, request));
  }

  @Post(':id/reveal-identifiers')
  @Header('Cache-Control', 'no-store')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'revealBackofficeInventoryIdentifiers' })
  @ApiOkResponse({ type: DecryptedIdentifiersResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public reveal(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: InventoryReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.revealIdentifiers(params.id, input, auditActor(auth, request));
  }
}

@ApiTags('backoffice-inventory')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard)
@Controller('backoffice/inventory-locations')
export class InventoryLocationsController {
  public constructor(@Inject(InventoryService) private readonly service: InventoryService) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeInventoryLocations' })
  @ApiOkResponse({ type: InventoryLocationListResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public list() {
    return this.service.listLocations();
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
