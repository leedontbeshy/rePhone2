import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { databaseTargetIssue } from '../../config/database-target.js';
import { ApiError } from '../../common/errors/api-error.js';

@Injectable()
export class AffiliateRuntime {
  public readonly enabled = process.env['AFFILIATE_ENABLED'] === 'true';
  public readonly mode: 'TEST' | 'LIVE';
  private readonly key: Buffer;
  public constructor(@Inject(APP_CONFIG) public readonly config: AppConfig) {
    const mode = process.env['AFFILIATE_ENVIRONMENT'] ?? 'TEST';
    this.mode = mode === 'LIVE' ? 'LIVE' : 'TEST';
    if (!['TEST', 'LIVE'].includes(mode)) throw new Error('Invalid AFFILIATE_ENVIRONMENT');
    if (this.enabled && mode === 'TEST') {
      if (
        config.environment === 'production' ||
        databaseTargetIssue(config.database.url, config.environment)
      )
        throw new Error('Affiliate TEST requires the local dev or test database');
      if (
        !['localhost', '127.0.0.1', '::1', 'mailpit', 'mailpit-dev', 'mailhog'].includes(
          config.mail.host,
        )
      )
        throw new Error('Affiliate TEST requires a local mail sink');
    }
    const secret = process.env['AFFILIATE_ENCRYPTION_KEY']?.trim() || undefined;
    if (this.enabled && mode === 'LIVE' && !secret)
      throw new Error('AFFILIATE_ENCRYPTION_KEY is required in LIVE');
    const source = Buffer.from(secret ?? config.identifiers.encryptionKey, 'base64');
    if (source.length !== 32) throw new Error('AFFILIATE_ENCRYPTION_KEY must contain 32 bytes');
    this.key = Buffer.from(hkdfSync('sha256', source, mode, 'rephone/affiliate/v1', 32));
  }
  public assertEnabled(): void {
    if (!this.enabled)
      throw new ApiError('SERVICE_UNAVAILABLE', 'Chương trình cộng tác viên chưa sẵn sàng.');
  }
  public encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    return [iv, Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]), cipher.getAuthTag()]
      .map((v) => v.toString('base64url'))
      .join('.');
  }
  public decrypt(value: string): string {
    const [iv, data, tag] = value.split('.');
    if (!iv || !data || !tag) throw new ApiError('INTERNAL_ERROR');
    const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString(
      'utf8',
    );
  }
}
