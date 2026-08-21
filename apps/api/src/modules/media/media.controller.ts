import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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
import {
  MediaResourceIdParamsDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
} from './media.dto.js';
import { ProductMediaResponse } from './media-response.dto.js';
import { MediaService, type MediaOwnerType } from './media.service.js';

const MEDIA_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED or ACCESS_TOKEN_INVALID' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 409 as const, description: 'INVALID_STATE_TRANSITION or CONCURRENT_MODIFICATION' },
  { status: 413 as const, description: 'FILE_TOO_LARGE' },
  { status: 415 as const, description: 'UNSUPPORTED_FILE_TYPE' },
  { status: 422 as const, description: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 503 as const, description: 'STORAGE_UNAVAILABLE' },
];

@ApiTags('backoffice-media')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice')
export class MediaController {
  public constructor(@Inject(MediaService) private readonly service: MediaService) {}

  @Post('products/:id/media')
  @MediaUploadOperation('uploadBackofficeProductMedia')
  public uploadProduct(
    @Param() params: MediaResourceIdParamsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: UploadProductMediaDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.upload('PRODUCT', params.id, file, input, auth, request);
  }

  @Post('variants/:id/media')
  @MediaUploadOperation('uploadBackofficeVariantMedia')
  public uploadVariant(
    @Param() params: MediaResourceIdParamsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: UploadProductMediaDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.upload('VARIANT', params.id, file, input, auth, request);
  }

  @Post('inventory-units/:id/media')
  @MediaUploadOperation('uploadBackofficeInventoryUnitMedia')
  public uploadUnit(
    @Param() params: MediaResourceIdParamsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: UploadProductMediaDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.upload('INVENTORY_UNIT', params.id, file, input, auth, request);
  }

  @Patch('product-media/:id')
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'updateBackofficeProductMedia' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateProductMediaDto })
  @ApiOkResponse({ type: ProductMediaResponse })
  @ApiErrorResponses(...MEDIA_ERRORS)
  public update(
    @Param() params: MediaResourceIdParamsDto,
    @Body() input: UpdateProductMediaDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.update(params.id, input, auditActor(auth, request));
  }

  @Delete('product-media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'deleteBackofficeProductMedia' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...MEDIA_ERRORS)
  public delete(
    @Param() params: MediaResourceIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.service.delete(params.id, auditActor(auth, request));
  }

  private upload(
    ownerType: MediaOwnerType,
    ownerId: string,
    file: Express.Multer.File | undefined,
    input: UploadProductMediaDto,
    auth: AuthContext,
    request: Request,
  ) {
    return this.service.upload(ownerType, ownerId, file, input, auditActor(auth, request));
  }
}

function MediaUploadOperation(operationId: string) {
  return function applyMediaUpload(
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): void {
    UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 8 * 1024 * 1024 } }))(
      target,
      propertyKey,
      descriptor,
    );
    BackofficeRateLimit('upload')(target, propertyKey, descriptor);
    ApiConsumes('multipart/form-data')(target, propertyKey, descriptor);
    ApiParam({ name: 'id', type: String, format: 'uuid' })(target, propertyKey, descriptor);
    ApiBody({
      schema: {
        type: 'object',
        required: ['file'],
        additionalProperties: false,
        properties: {
          file: { type: 'string', format: 'binary' },
          altText: { type: 'string', maxLength: 255 },
          sortOrder: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    })(target, propertyKey, descriptor);
    ApiOperation({ operationId })(target, propertyKey, descriptor);
    ApiCreatedResponse({ type: ProductMediaResponse })(target, propertyKey, descriptor);
    ApiErrorResponses(...MEDIA_ERRORS)(target, propertyKey, descriptor);
  };
}

function auditActor(auth: AuthContext, request: Request): AuditActorContext {
  return { actorUserId: auth.userId, ...requestContext(request) };
}
