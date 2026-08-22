import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

export const GUEST_ORDER_TOKEN_HEADER = 'X-Guest-Order-Token';
const GUEST_ORDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

@Injectable()
export class GuestOrderIdentityService {
  public createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  public digestToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  public readToken(request: Request): string | undefined {
    const token = request.get(GUEST_ORDER_TOKEN_HEADER);
    return token !== undefined && GUEST_ORDER_TOKEN_PATTERN.test(token) ? token : undefined;
  }

  public matches(token: string | undefined, expectedDigest: string | null): boolean {
    if (
      token === undefined ||
      !GUEST_ORDER_TOKEN_PATTERN.test(token) ||
      expectedDigest === null ||
      !SHA256_HEX_PATTERN.test(expectedDigest)
    ) {
      return false;
    }
    return timingSafeEqual(
      Buffer.from(this.digestToken(token), 'hex'),
      Buffer.from(expectedDigest, 'hex'),
    );
  }
}
