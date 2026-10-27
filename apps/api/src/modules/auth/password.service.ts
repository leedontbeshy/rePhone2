import { Inject, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { ApiError } from '../../common/errors/api-error.js';

@Injectable()
export class PasswordService {
  private readonly dummyHash: Promise<string>;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.dummyHash = this.hash('rephone-dummy-password-1');
  }

  public hash(password: string): Promise<string> {
    return this.bounded(() =>
      hash(password, {
        type: argon2id,
        memoryCost: this.config.auth.argon2MemoryKib,
        timeCost: this.config.auth.argon2TimeCost,
        parallelism: this.config.auth.argon2Parallelism,
      }),
    );
  }

  public async verify(passwordHash: string, password: string): Promise<boolean> {
    return this.bounded(() => verify(passwordHash, password).catch(() => false));
  }

  public async performDummyVerification(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }

  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 2) {
      if (this.waiting.length >= 20) {
        throw new ApiError('RATE_LIMITED', undefined, [], { 'Retry-After': '1' });
      }
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    } else this.active += 1;
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}
