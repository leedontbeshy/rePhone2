import { SetMetadata } from '@nestjs/common';

export type BackofficeRateLimitKind = 'mutation' | 'upload';
export const BACKOFFICE_RATE_LIMIT_METADATA_KEY = 'backoffice.rate-limit';

export const BackofficeRateLimit = (kind: BackofficeRateLimitKind) =>
  SetMetadata(BACKOFFICE_RATE_LIMIT_METADATA_KEY, kind);
