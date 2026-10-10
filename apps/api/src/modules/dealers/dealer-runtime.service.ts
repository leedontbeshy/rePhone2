import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class DealerRuntime implements OnModuleInit {
  public readonly enabled: boolean;
  public readonly mode: 'TEST' | 'LIVE';
  public readonly termsVersion = 'dealer-v1.0';
  private readonly key: Buffer;

  public constructor(
    @Inject(APP_CONFIG) public readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    // Deployment readiness is separate from the database-backed business gate controlled by ADMIN.
    const enabled = process.env['DEALER_ENABLED'] ?? 'false';
    const mode = process.env['DEALER_ENVIRONMENT'] ?? 'TEST';
    if (!['true', 'false'].includes(enabled) || !['TEST', 'LIVE'].includes(mode)) {
      throw new Error('Invalid dealer environment configuration');
    }
    this.enabled = enabled === 'true';
    this.mode = mode as 'TEST' | 'LIVE';
    if (this.enabled && this.mode === 'TEST') {
      if (!/_(test|sandbox)$/.test(new URL(config.database.url).pathname))
        throw new Error('TEST dealers require an isolated database ending _test or _sandbox');
      if (!['localhost', '127.0.0.1', '::1', 'mailpit', 'mailhog'].includes(config.mail.host))
        throw new Error('TEST dealers require a local mail sink');
      if (
        ![
          config.storage.publicBucket,
          config.storage.privateBucket,
          config.storage.storeBucket,
        ].every((bucket) => /test|sandbox/.test(bucket))
      )
        throw new Error('TEST dealer storage buckets must be labelled test or sandbox');
    }
    const secret = process.env['DEALER_ENCRYPTION_KEY']?.trim() || undefined;
    if (this.enabled && this.mode === 'LIVE' && secret === undefined) {
      throw new Error('LIVE dealers require a separate DEALER_ENCRYPTION_KEY');
    }
    const source = Buffer.from(secret ?? config.identifiers.encryptionKey, 'base64');
    if (source.length !== 32) throw new Error('DEALER_ENCRYPTION_KEY must contain 32 bytes');
    this.key = Buffer.from(hkdfSync('sha256', source, this.mode, 'rephone/dealer/v1', 32));
  }

  public async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    const marker = await this.prisma.dealerEnvironment.upsert({
      where: { key: 'INSTANCE' },
      create: { key: 'INSTANCE', mode: this.mode },
      update: {},
    });
    if (marker.mode !== this.mode)
      throw new Error('Dealer database belongs to another environment');
    await this.prisma.dealerPricingPolicy.upsert({
      where: { key: 'GLOBAL' },
      create: { key: 'GLOBAL' },
      update: {},
    });
  }

  public assertEnabled(): void {
    if (!this.enabled) throw new ApiError('SERVICE_UNAVAILABLE', 'Cổng đại lý chưa được bật.');
  }

  public connectionInfo() {
    const publicUrl = (value: string | undefined) => {
      if (!value) return null;
      try {
        const url = new URL(value);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !(
            url.protocol === 'https:' ||
            (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
          )
        )
          return null;
        return url.toString().replace(/\/$/, '');
      } catch {
        return null;
      }
    };
    return {
      apiBaseUrl: `${this.config.api.publicUrl.replace(/\/$/, '')}/api/v1`,
      liveWebUrl: publicUrl(process.env['DEALER_LIVE_WEB_URL']),
      sandbox: {
        webUrl:
          this.mode === 'TEST'
            ? this.config.api.webPublicUrl
            : publicUrl(process.env['DEALER_SANDBOX_WEB_URL']),
        apiBaseUrl:
          this.mode === 'TEST'
            ? `${this.config.api.publicUrl.replace(/\/$/, '')}/api/v1`
            : publicUrl(process.env['DEALER_SANDBOX_API_URL']),
      },
    };
  }

  public assertSandbox(): void {
    this.assertEnabled();
    if (this.mode !== 'TEST') throw new ApiError('RESOURCE_NOT_FOUND');
  }

  public encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`rephone/dealer/${this.mode}`));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  public decrypt(value: string): string {
    const [iv, tag, data] = value.split('.');
    if (iv === undefined || tag === undefined || data === undefined)
      throw new ApiError('INTERNAL_ERROR');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`rephone/dealer/${this.mode}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function dealerHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalDealerJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalDealerJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalDealerJson(record[key])}`)
    .join(',')}}`;
}
