import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
  TransferInventoryUnitDto,
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
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 100 })
  @ApiQuery({ name: 'productId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'variantId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [
      'RECEIVED',
      'INSPECTING',
      'AVAILABLE',
      'IN_TRANSIT',
      'SOLD',
      'REPAIRING',
      'QUARANTINED',
      'WRITTEN_OFF',
    ],
  })
  @ApiQuery({ name: 'conditionGrade', required: false, enum: ['A', 'B', 'C'] })
  @ApiQuery({
    name: 'simLockStatus',
    required: false,
    enum: ['UNLOCKED', 'CARRIER_LOCKED', 'UNKNOWN'],
  })
  @ApiQuery({ name: 'minBatteryHealth', required: false, type: Number, minimum: 0, maximum: 100 })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, default: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['receivedAt', 'updatedAt', 'inventoryCode', 'salePrice'],
    default: 'receivedAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @ApiOkResponse({ type: InventoryUnitListResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public list(@Query() query: InventoryUnitListQueryDto) {
    return this.service.listUnits(query);
  }

  @Post('lookup-identifier')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'lookupBackofficeInventoryIdentifier' })
  @ApiBody({ type: IdentifierLookupDto })
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
  @ApiBody({ type: IntakeInventoryUnitDto })
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
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InventoryCostResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public getCost(@Param() params: InventoryResourceIdParamsDto) {
    return this.service.getCost(params.id);
  }

  @Patch(':id/cost')
  @Roles('ADMIN')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeInventoryCost' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateInventoryCostDto })
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
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public get(@Param() params: InventoryResourceIdParamsDto) {
    return this.service.getUnit(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeInventoryUnit' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateInventoryUnitDto })
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

  @Post(':id/make-available')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'makeBackofficeInventoryUnitAvailable' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public makeAvailable(
    @Param() params: InventoryResourceIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.makeAvailable(params.id, auditActor(auth, request));
  }

  @Post(':id/send-to-repair')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'sendBackofficeInventoryUnitToRepair' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: InventoryReasonDto })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public sendToRepair(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: InventoryReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.sendToRepair(params.id, input.reason, auditActor(auth, request));
  }

  @Post(':id/quarantine')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'quarantineBackofficeInventoryUnit' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: InventoryReasonDto })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public quarantine(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: InventoryReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.quarantine(params.id, input.reason, auditActor(auth, request));
  }

  @Post(':id/write-off')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'writeOffBackofficeInventoryUnit' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: InventoryReasonDto })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public writeOff(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: InventoryReasonDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.writeOff(params.id, input.reason, auditActor(auth, request), auth.role);
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'transferBackofficeInventoryUnit' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: TransferInventoryUnitDto })
  @ApiOkResponse({ type: InventoryUnitResponse })
  @ApiErrorResponses(...INVENTORY_ERRORS)
  public transfer(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: TransferInventoryUnitDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.transfer(params.id, input, auditActor(auth, request));
  }

  @Post(':id/reveal-identifiers')
  @Header('Cache-Control', 'no-store')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'revealBackofficeInventoryIdentifiers' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: InventoryReasonDto })
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
