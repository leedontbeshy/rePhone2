import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { OrderRateLimitKind } from './order-rate-limit.decorator.js';

const WINDOW_MS = 60_000;
const LIMITS: Readonly<Record<OrderRateLimitKind, number>> = {
  PREVIEW: 60,
  CREATE: 10,
  GUEST_ORDER: 10,
};

@Injectable()
export class OrderRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  public consume(kind: OrderRateLimitKind, actorKey: string): void {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const key = `${kind}:${actorKey}`;
    const active = (this.attempts.get(key) ?? []).filter((attempt) => attempt > cutoff);
    if (active.length >= LIMITS[kind]) {
      const retryAfter = Math.max(1, Math.ceil(((active[0] ?? now) + WINDOW_MS - now) / 1_000));
      this.attempts.set(key, active);
      throw new ApiError('RATE_LIMITED', undefined, [], {
        'Retry-After': retryAfter.toString(),
      });
    }
    active.push(now);
    this.attempts.set(key, active);
  }

  public clear(): void {
    this.attempts.clear();
  }
}
