import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MAIL_PROVIDER } from '../../common/providers/mail-provider.js';
import { NoopMailProvider, SmtpMailProvider } from '../../common/providers/smtp-mail.provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuthController } from './auth.controller.js';
import { AuthRateLimiter } from './auth-rate-limiter.service.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { PasswordService } from './password.service.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';
import { AuthTokensRepository } from './repositories/auth-tokens.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { SessionGuard } from './session.guard.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.auth.accessSecret }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimiter,
    PasswordService,
    TokenService,
    CsrfGuard,
    SessionGuard,
    UsersRepository,
    AuthSessionsRepository,
    AuthTokensRepository,
    {
      provide: MAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.environment === 'test' ? new NoopMailProvider() : new SmtpMailProvider(config.mail),
    },
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    SessionGuard,
    UsersRepository,
    AuthSessionsRepository,
  ],
})
export class AuthModule {}
