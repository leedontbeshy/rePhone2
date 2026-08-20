import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';

interface RateWindow {
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE_MS = 60_000;

@Injectable()
export class AuthRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  public login(ipAddress: string, normalizedEmail: string): void {
    const identity = `${ipAddress}:${normalizedEmail}`;
    this.consume(`login:minute:${identity}`, { limit: 5, windowMs: MINUTE_MS });
    this.consume(`login:hour:${identity}`, { limit: 30, windowMs: 60 * MINUTE_MS });
  }

  public register(ipAddress: string): void {
    this.consume(`register:${ipAddress}`, { limit: 5, windowMs: 15 * MINUTE_MS });
  }

  public reset(ipAddress: string, target: string): void {
    this.consume(`reset:${ipAddress}:${target}`, { limit: 5, windowMs: 15 * MINUTE_MS });
  }

  public invitation(ipAddress: string, target: string): void {
    this.consume(`invitation:${ipAddress}:${target}`, { limit: 5, windowMs: 15 * MINUTE_MS });
  }

  public refresh(ipAddress: string, sessionTarget: string): void {
    this.consume(`refresh:${ipAddress}:${sessionTarget}`, { limit: 30, windowMs: MINUTE_MS });
  }

  public clear(): void {
    this.attempts.clear();
  }

  private consume(key: string, window: RateWindow): void {
    const now = Date.now();
    const cutoff = now - window.windowMs;
    const activeAttempts = (this.attempts.get(key) ?? []).filter((attempt) => attempt > cutoff);

    if (activeAttempts.length >= window.limit) {
      const oldestAttempt = activeAttempts[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestAttempt + window.windowMs - now) / 1_000),
      );
      this.attempts.set(key, activeAttempts);
      throw new ApiError('RATE_LIMITED', undefined, [], {
        'Retry-After': retryAfterSeconds.toString(),
      });
    }

    activeAttempts.push(now);
    this.attempts.set(key, activeAttempts);
  }
}
