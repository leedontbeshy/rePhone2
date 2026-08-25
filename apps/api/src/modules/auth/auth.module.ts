import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
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
import { RolesGuard } from './roles.guard.js';
import { BackofficeRateLimiter } from './backoffice-rate-limiter.service.js';
import { BackofficeRateLimitGuard } from './backoffice-rate-limit.guard.js';
import { CommerceRateLimitGuard } from './commerce-rate-limit.guard.js';
import { CommerceRateLimiter } from './commerce-rate-limiter.service.js';
import { GuestCartIdentityService } from './guest-cart-identity.service.js';
import { GuestCommerceCsrfGuard } from './guest-commerce-csrf.guard.js';
import { OptionalSessionGuard } from './optional-session.guard.js';
import { SessionResolver } from './session-resolver.service.js';
import { EmployeeIdentityGateway } from './employee-identity.gateway.js';
import { AuthMaintenanceRepository } from './auth-maintenance.repository.js';
import { AuthMaintenanceService } from './auth-maintenance.service.js';

@Module({
  imports: [
    NotificationsModule,
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
    SessionResolver,
    CsrfGuard,
    SessionGuard,
    OptionalSessionGuard,
    GuestCartIdentityService,
    GuestCommerceCsrfGuard,
    CommerceRateLimiter,
    CommerceRateLimitGuard,
    RolesGuard,
    BackofficeRateLimiter,
    BackofficeRateLimitGuard,
    UsersRepository,
    AuthSessionsRepository,
    AuthTokensRepository,
    EmployeeIdentityGateway,
    AuthMaintenanceRepository,
    AuthMaintenanceService,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    SessionResolver,
    SessionGuard,
    OptionalSessionGuard,
    GuestCartIdentityService,
    GuestCommerceCsrfGuard,
    CommerceRateLimiter,
    CommerceRateLimitGuard,
    RolesGuard,
    BackofficeRateLimiter,
    BackofficeRateLimitGuard,
    UsersRepository,
    AuthSessionsRepository,
    EmployeeIdentityGateway,
    AuthMaintenanceService,
  ],
})
export class AuthModule {}
