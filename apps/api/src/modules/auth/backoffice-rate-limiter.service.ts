import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { BackofficeRateLimitKind } from './backoffice-rate-limit.decorator.js';

const WINDOWS: Readonly<Record<BackofficeRateLimitKind, { limit: number; windowMs: number }>> = {
  mutation: { limit: 120, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 10 * 60_000 },
};

@Injectable()
export class BackofficeRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  public consume(actorId: string, kind: BackofficeRateLimitKind): void {
    const now = Date.now();
    const window = WINDOWS[kind];
    const key = `${kind}:${actorId}`;
    const cutoff = now - window.windowMs;
    const active = (this.attempts.get(key) ?? []).filter((attempt) => attempt > cutoff);
    if (active.length >= window.limit) {
      const oldest = active[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((oldest + window.windowMs - now) / 1_000));
      this.attempts.set(key, active);
      throw new ApiError('RATE_LIMITED', undefined, [], { 'Retry-After': retryAfter.toString() });
    }
    active.push(now);
    this.attempts.set(key, active);
  }

  public clear(): void {
    this.attempts.clear();
  }
}
