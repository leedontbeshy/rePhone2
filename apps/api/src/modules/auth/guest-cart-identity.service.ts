import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Request } from 'express';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { GUEST_CART_COOKIE_NAME, GUEST_CART_COOKIE_PATH } from './auth.constants.js';

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class GuestCartIdentityService {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  public digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  public readToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[GUEST_CART_COOKIE_NAME];
    return typeof token === 'string' && GUEST_TOKEN_PATTERN.test(token) ? token : undefined;
  }

  public cookieOptions(): CookieOptions {
    const webHostname = new URL(this.config.api.webPublicUrl).hostname;
    const local = webHostname === 'localhost' || webHostname === '127.0.0.1';
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: !local,
      path: GUEST_CART_COOKIE_PATH,
      maxAge: this.config.auth.guestCartTtlDays * 24 * 60 * 60 * 1_000,
    };
  }

  public clearCookieOptions(): CookieOptions {
    const options = this.cookieOptions();
    delete options.maxAge;
    return options;
  }
}
