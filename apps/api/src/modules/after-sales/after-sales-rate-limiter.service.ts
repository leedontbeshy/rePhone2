import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';

@Injectable()
export class AfterSalesRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  public consume(key: string, limit = 20, windowMs = 10 * 60_000): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const active = (this.attempts.get(key) ?? []).filter((attempt) => attempt > cutoff);
    if (active.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil(((active[0] ?? now) + windowMs - now) / 1_000));
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
