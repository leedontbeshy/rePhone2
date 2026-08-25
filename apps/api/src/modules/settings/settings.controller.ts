import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { UpdateStoreSettingsDto, UploadStoreBankQrDto } from './settings.dto.js';
import { PublicStoreResponse, StoreSettingsResponse } from './settings-response.dto.js';
import { SettingsService } from './settings.service.js';

const SETTINGS_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 409 as const, description: 'SETTINGS_VERSION_CONFLICT' },
  { status: 413 as const, description: 'FILE_TOO_LARGE' },
  { status: 415 as const, description: 'UNSUPPORTED_FILE_TYPE' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 503 as const, description: 'SERVICE_UNAVAILABLE or STORAGE_UNAVAILABLE' },
];

@ApiTags('Store')
@Controller('store')
export class PublicStoreController {
  public constructor(@Inject(SettingsService) private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ operationId: 'getPublicStore', summary: 'Get public store information' })
  @ApiOkResponse({ type: PublicStoreResponse })
  @ApiErrorResponses({ status: 503, description: 'SERVICE_UNAVAILABLE' })
  public get() {
    return this.service.getPublicStore();
  }
}

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/settings')
export class BackofficeSettingsController {
  public constructor(@Inject(SettingsService) private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ operationId: 'getBackofficeSettings', summary: 'Get mutable store settings' })
  @ApiOkResponse({ type: StoreSettingsResponse })
  @ApiErrorResponses(...SETTINGS_ERRORS)
  public get() {
    return this.service.getBackoffice();
  }

  @Patch()
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeSettings', summary: 'Update store settings' })
  @ApiBody({ type: UpdateStoreSettingsDto })
  @ApiOkResponse({ type: StoreSettingsResponse })
  @ApiErrorResponses(...SETTINGS_ERRORS)
  public update(
    @Body() input: UpdateStoreSettingsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.update(input, auditActor(auth, request));
  }

  @Post('bank-qr')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit(['mutation', 'upload'])
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'uploadBackofficeBankQr', summary: 'Upload the public bank QR' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'expectedVersion'],
      additionalProperties: false,
      properties: {
        file: { type: 'string', format: 'binary' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
  })
  @ApiOkResponse({ type: StoreSettingsResponse })
  @ApiErrorResponses(...SETTINGS_ERRORS)
  public uploadBankQr(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: UploadStoreBankQrDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.uploadBankQr(input.expectedVersion, file, auditActor(auth, request));
  }
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
