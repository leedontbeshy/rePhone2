import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import type { UserRole } from '../../generated/prisma/enums.js';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  sessionId: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}

@Injectable()
export class TokenService {
  public constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  public digestOpaqueToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  public signAccessToken(userId: string, role: UserRole, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(
      { role, sessionId },
      {
        subject: userId,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
        expiresIn: this.config.auth.accessTtlSeconds,
      },
    );
  }

  public verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token, {
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
    });
  }
}
