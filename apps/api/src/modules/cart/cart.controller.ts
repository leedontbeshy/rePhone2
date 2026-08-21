import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import type { AuthContext } from '../auth/auth-context.js';
import { GUEST_CART_COOKIE_NAME } from '../auth/auth.constants.js';
import { CommerceRateLimitGuard } from '../auth/commerce-rate-limit.guard.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import { GuestCommerceCsrfGuard } from '../auth/guest-commerce-csrf.guard.js';
import { OptionalSessionGuard } from '../auth/optional-session.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  AddAccessoryCartItemDto,
  AddCartItemDto,
  AddIphoneCartItemDto,
  CartItemParamsDto,
  UpdateCartItemDto,
} from './cart.dto.js';
import { CartResponse } from './cart-response.dto.js';
import { CartService } from './cart.service.js';

@ApiTags('cart')
@ApiExtraModels(AddIphoneCartItemDto, AddAccessoryCartItemDto)
@Controller('cart')
export class CartController {
  public constructor(
    @Inject(CartService) private readonly cartService: CartService,
    @Inject(GuestCartIdentityService)
    private readonly guestIdentity: GuestCartIdentityService,
  ) {}

  @Get()
  @UseGuards(OptionalSessionGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'getCart', summary: 'Get the current guest or customer cart' })
  @ApiOkResponse({ type: CartResponse })
  @ApiErrorResponses(
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public async getCart(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.cartService.getCart(request);
  }

  @Post('items')
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, CommerceRateLimitGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'addCartItem', summary: 'Set a desired cart target' })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AddIphoneCartItemDto) },
        { $ref: getSchemaPath(AddAccessoryCartItemDto) },
      ],
      discriminator: { propertyName: 'itemType' },
    },
  })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 for guest cookie mutations; not required for Bearer.',
  })
  @ApiCreatedResponse({
    type: CartResponse,
    headers: {
      'Set-Cookie': {
        description: 'Creates rephone_guest_cart on the first successful guest mutation.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: CartResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 409, description: 'INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async addItem(
    @Req() request: Request,
    @Body() input: AddCartItemDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cartService.addItem(request, input);
    response.status(result.created === true ? HttpStatus.CREATED : HttpStatus.OK);
    response.setHeader('Cache-Control', 'no-store');
    if (result.issuedGuestToken !== undefined) {
      response.cookie(
        GUEST_CART_COOKIE_NAME,
        result.issuedGuestToken,
        this.guestIdentity.cookieOptions(),
      );
    }
    return result.cart;
  }

  @Patch('items/:itemId')
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, CommerceRateLimitGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'updateCartItem', summary: 'Set accessory cart quantity' })
  @ApiBody({ type: UpdateCartItemDto })
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 for guest cookie mutations; not required for Bearer.',
  })
  @ApiOkResponse({ type: CartResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    {
      status: 409,
      description: 'CART_NOT_ACTIVE, CART_ITEM_QUANTITY_FIXED or CONCURRENT_MODIFICATION',
    },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async updateItem(
    @Req() request: Request,
    @Param() params: CartItemParamsDto,
    @Body() input: UpdateCartItemDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.cartService.updateItem(request, params.itemId, input.quantity);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OptionalSessionGuard, GuestCommerceCsrfGuard, CommerceRateLimitGuard)
  @ApiBearerAuth('access-token')
  @ApiSecurity('rephone_guest_cart')
  @ApiOperation({ operationId: 'removeCartItem', summary: 'Remove an owned cart item' })
  @ApiNoContentResponse()
  @ApiHeader({
    name: 'X-Rephone-CSRF',
    required: false,
    description: 'Required with value 1 for guest cookie mutations; not required for Bearer.',
  })
  @ApiErrorResponses(
    { status: 401, description: 'ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN or CSRF_VALIDATION_FAILED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
    { status: 409, description: 'CART_NOT_ACTIVE or CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async removeItem(@Req() request: Request, @Param() params: CartItemParamsDto) {
    await this.cartService.removeItem(request, params.itemId);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard, CommerceRateLimitGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth('access-token')
  @ApiOperation({ operationId: 'mergeCart', summary: 'Claim or merge a guest cart after login' })
  @ApiOkResponse({ type: CartResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 409, description: 'CONCURRENT_MODIFICATION' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public async merge(
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cart = await this.cartService.merge(auth, request);
    response.setHeader('Cache-Control', 'no-store');
    response.clearCookie(GUEST_CART_COOKIE_NAME, this.guestIdentity.clearCookieOptions());
    return cart;
  }
}
