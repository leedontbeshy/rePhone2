import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import type { AuthContext } from '../auth/auth-context.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../auth/auth.constants.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  ChangePasswordDto,
  CreateAddressDto,
  UpdateAccountDto,
  UpdateAddressDto,
} from './account.dto.js';
import { AccountResponse, AddressListResponse, AddressResponse } from './account-response.dto.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('account')
@ApiBearerAuth('access-token')
@UseGuards(SessionGuard)
@Controller('account')
export class AccountsController {
  public constructor(
    @Inject(AccountsService) private readonly accountsService: AccountsService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getAccount', summary: 'Get the authenticated account' })
  @ApiOkResponse({ type: AccountResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
  )
  public getAccount(@CurrentAuth() auth: AuthContext) {
    return this.accountsService.getAccount(auth);
  }

  @Patch()
  @ApiOperation({ operationId: 'updateAccount', summary: 'Update the authenticated profile' })
  @ApiBody({ type: UpdateAccountDto })
  @ApiOkResponse({ type: AccountResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
  )
  public updateAccount(@CurrentAuth() auth: AuthContext, @Body() input: UpdateAccountDto) {
    return this.accountsService.updateAccount(auth, input);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'changePassword',
    summary: 'Change password and revoke all sessions',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 422, description: 'CURRENT_PASSWORD_INCORRECT' },
  )
  public async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.changePassword(auth.userId, input.currentPassword, input.newPassword);
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Get('addresses')
  @ApiOperation({ operationId: 'listAccountAddresses', summary: 'List active customer addresses' })
  @ApiOkResponse({ type: AddressListResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public listAddresses(@CurrentAuth() auth: AuthContext) {
    return this.accountsService.listAddresses(auth);
  }

  @Post('addresses')
  @ApiOperation({ operationId: 'createAccountAddress', summary: 'Create a customer address' })
  @ApiBody({ type: CreateAddressDto })
  @ApiCreatedResponse({ type: AddressResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
  )
  public createAddress(@CurrentAuth() auth: AuthContext, @Body() input: CreateAddressDto) {
    return this.accountsService.createAddress(auth, input);
  }

  @Patch('addresses/:id')
  @ApiOperation({
    operationId: 'updateAccountAddress',
    summary: 'Update an owned customer address',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateAddressDto })
  @ApiOkResponse({ type: AddressResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
  )
  public updateAddress(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) addressId: string,
    @Body() input: UpdateAddressDto,
  ) {
    return this.accountsService.updateAddress(auth, addressId, input);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'archiveAccountAddress',
    summary: 'Archive an owned customer address',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 404, description: 'RESOURCE_NOT_FOUND' },
  )
  public archiveAddress(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) addressId: string,
  ): Promise<void> {
    return this.accountsService.archiveAddress(auth, addressId);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.environment === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
