import { Inject, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';

@Injectable()
export class PasswordService {
  private readonly dummyHash: Promise<string>;

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.dummyHash = this.hash('rephone-dummy-password-1');
  }

  public hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: this.config.auth.argon2MemoryKib,
      timeCost: this.config.auth.argon2TimeCost,
      parallelism: this.config.auth.argon2Parallelism,
    });
  }

  public async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  public async performDummyVerification(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }
}
