import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CommerceRateLimitGuard } from '../auth/commerce-rate-limit.guard.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  AddAccessoryWishlistItemDto,
  AddIphoneWishlistItemDto,
  AddWishlistItemDto,
  WishlistItemParamsDto,
} from './wishlist.dto.js';
import { WishlistItemResponse, WishlistListResponse } from './wishlist-response.dto.js';
import { WishlistService } from './wishlist.service.js';

@ApiTags('wishlist')
@ApiExtraModels(AddIphoneWishlistItemDto, AddAccessoryWishlistItemDto)
@ApiBearerAuth('access-token')
@Roles('CUSTOMER')
@UseGuards(SessionGuard, RolesGuard)
@Controller('wishlist')
export class WishlistController {
  public constructor(@Inject(WishlistService) private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ operationId: 'getWishlist', summary: 'List the customer wishlist' })
  @ApiOkResponse({ type: WishlistListResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public list(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.wishlistService.list(auth);
  }

  @Post('items')
  @UseGuards(CommerceRateLimitGuard)
  @ApiOperation({
    operationId: 'addWishlistItem',
    summary: 'Add an exact public offer to wishlist',
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AddIphoneWishlistItemDto) },
        { $ref: getSchemaPath(AddAccessoryWishlistItemDto) },
      ],
      discriminator: {
        propertyName: 'itemType',
        mapping: {
          IPHONE: getSchemaPath(AddIphoneWishlistItemDto),
          ACCESSORY: getSchemaPath(AddAccessoryWishlistItemDto),
        },
      },
    },
  })
  @ApiCreatedResponse({ type: WishlistItemResponse })
  @ApiOkResponse({ type: WishlistItemResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 409, description: 'INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async add(
    @CurrentAuth() auth: AuthContext,
    @Body() input: AddWishlistItemDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.wishlistService.add(auth, input);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    response.setHeader('Cache-Control', 'no-store');
    return result.item;
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CommerceRateLimitGuard)
  @ApiOperation({ operationId: 'removeWishlistItem', summary: 'Remove an owned wishlist item' })
  @ApiParam({ name: 'itemId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 409, description: 'CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async remove(@CurrentAuth() auth: AuthContext, @Param() params: WishlistItemParamsDto) {
    await this.wishlistService.remove(auth, params.itemId);
  }
}
