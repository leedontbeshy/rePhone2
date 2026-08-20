import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import {
  AcceptEmployeeInvitationDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto.js';
import {
  AuthSessionResponse,
  GenericAcceptedResponse,
  RegisteredAccountResponse,
} from './auth-response.dto.js';
import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { RequestMetadata, SessionIssueResult, SessionPayload } from './auth.types.js';
import { CsrfGuard } from './csrf.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  public constructor(
    private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @ApiOperation({ operationId: 'registerAccount', summary: 'Register an active customer account' })
  @ApiCreatedResponse({ type: RegisteredAccountResponse })
  public register(@Body() input: RegisterDto, @Req() request: Request) {
    return this.authService.register(input, requestMetadata(request));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'login', summary: 'Create an authenticated session' })
  @ApiOkResponse({ type: AuthSessionResponse })
  public async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionPayload> {
    const result = await this.authService.login(
      input.email,
      input.password,
      requestMetadata(request),
    );
    this.setRefreshCookie(response, result);
    return sessionPayload(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiHeader({ name: CSRF_HEADER_NAME, required: true, schema: { enum: [CSRF_HEADER_VALUE] } })
  @ApiOperation({ operationId: 'refreshSession', summary: 'Rotate the refresh token generation' })
  @ApiOkResponse({ type: AuthSessionResponse })
  public async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionPayload> {
    const result = await this.authService.refresh(
      request.cookies[REFRESH_COOKIE_NAME] as string | undefined,
      requestMetadata(request),
    );
    this.setRefreshCookie(response, result);
    return sessionPayload(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiHeader({ name: CSRF_HEADER_NAME, required: true, schema: { enum: [CSRF_HEADER_VALUE] } })
  @ApiOperation({ operationId: 'logout', summary: 'Revoke the current refresh-token family' })
  @ApiNoContentResponse()
  public async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.cookies[REFRESH_COOKIE_NAME] as string | undefined);
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ operationId: 'forgotPassword', summary: 'Request a password-reset email' })
  @ApiAcceptedResponse({ type: GenericAcceptedResponse })
  public forgotPassword(@Body() input: ForgotPasswordDto, @Req() request: Request) {
    return this.authService.forgotPassword(input.email, requestMetadata(request));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'resetPassword',
    summary: 'Consume a reset token and set a password',
  })
  @ApiNoContentResponse()
  public resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request): Promise<void> {
    return this.authService.resetPassword(input.token, input.newPassword, requestMetadata(request));
  }

  @Post('accept-employee-invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'acceptEmployeeInvitation',
    summary: 'Consume an employee invitation and activate the account',
  })
  @ApiNoContentResponse()
  public acceptEmployeeInvitation(
    @Body() input: AcceptEmployeeInvitationDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.authService.acceptEmployeeInvitation(
      input.token,
      input.password,
      requestMetadata(request),
    );
  }

  private setRefreshCookie(response: Response, result: SessionIssueResult): void {
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      ...this.cookieOptions(),
      expires: result.refreshExpiresAt,
      maxAge: Math.max(0, result.refreshExpiresAt.getTime() - Date.now()),
    });
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

function requestMetadata(request: Request): RequestMetadata {
  const userAgent = request.get('user-agent');
  return {
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 1_000) }),
  };
}

function sessionPayload(result: SessionIssueResult): SessionPayload {
  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  };
}
