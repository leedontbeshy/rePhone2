import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';

const LIMIT = 120;
const WINDOW_MS = 60_000;

@Injectable()
export class CommerceRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  public consume(actorKey: string): void {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const active = (this.attempts.get(actorKey) ?? []).filter((attempt) => attempt > cutoff);
    if (active.length >= LIMIT) {
      const retryAfter = Math.max(1, Math.ceil(((active[0] ?? now) + WINDOW_MS - now) / 1_000));
      this.attempts.set(actorKey, active);
      throw new ApiError('RATE_LIMITED', undefined, [], { 'Retry-After': retryAfter.toString() });
    }
    active.push(now);
    this.attempts.set(actorKey, active);
  }

  public clear(): void {
    this.attempts.clear();
  }
}
