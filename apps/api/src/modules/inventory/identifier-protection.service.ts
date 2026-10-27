import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { IdentifierCodec } from './identifier-protection.js';

@Injectable()
export class IdentifierProtectionService extends IdentifierCodec {
  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super(
      config.identifiers.encryptionKey,
      config.identifiers.hmacKey,
      config.identifiers.keyVersion ?? 1,
    );
  }
}
