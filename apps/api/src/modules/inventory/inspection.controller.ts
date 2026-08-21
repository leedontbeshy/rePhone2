import {
  Body,
  Controller,
  Get,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { InspectionService } from './inspection.service.js';
import {
  CreateInspectionDto,
  InspectionListQueryDto,
  InventoryResourceIdParamsDto,
  UpdateInspectionDto,
} from './inventory.dto.js';
import { InspectionListResponse, InspectionResponse } from './inventory-response.dto.js';

const INSPECTION_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'DUPLICATE_RESOURCE or INVALID_STATE_TRANSITION' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-inventory')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/inventory-units')
export class UnitInspectionsController {
  public constructor(@Inject(InspectionService) private readonly service: InspectionService) {}

  @Get(':id/inspections')
  @ApiOperation({ operationId: 'listBackofficeInventoryInspections' })
  @ApiOkResponse({ type: InspectionListResponse })
  @ApiErrorResponses(...INSPECTION_ERRORS)
  public list(
    @Param() params: InventoryResourceIdParamsDto,
    @Query() query: InspectionListQueryDto,
  ) {
    return this.service.list(params.id, query);
  }

  @Post(':id/inspections')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'createBackofficeInventoryInspection' })
  @ApiCreatedResponse({ type: InspectionResponse })
  @ApiErrorResponses(...INSPECTION_ERRORS)
  public create(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: CreateInspectionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.create(params.id, input, auditActor(auth, request));
  }
}

@ApiTags('backoffice-inventory')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/inspections')
export class InspectionsController {
  public constructor(@Inject(InspectionService) private readonly service: InspectionService) {}

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeInventoryInspection' })
  @ApiOkResponse({ type: InspectionResponse })
  @ApiErrorResponses(...INSPECTION_ERRORS)
  public get(@Param() params: InventoryResourceIdParamsDto) {
    return this.service.get(params.id);
  }

  @Patch(':id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeInventoryInspection' })
  @ApiOkResponse({ type: InspectionResponse })
  @ApiErrorResponses(...INSPECTION_ERRORS)
  public update(
    @Param() params: InventoryResourceIdParamsDto,
    @Body() input: UpdateInspectionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.update(params.id, input, auditActor(auth, request), auth.role);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'completeBackofficeInventoryInspection' })
  @ApiOkResponse({ type: InspectionResponse })
  @ApiErrorResponses(...INSPECTION_ERRORS)
  public complete(
    @Param() params: InventoryResourceIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.complete(params.id, auditActor(auth, request), auth.role);
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
