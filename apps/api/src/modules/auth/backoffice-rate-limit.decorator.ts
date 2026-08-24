import { SetMetadata } from '@nestjs/common';

export type BackofficeRateLimitKind = 'mutation' | 'upload';
export type BackofficeRateLimitRule =
  | BackofficeRateLimitKind
  | readonly BackofficeRateLimitKind[];
export const BACKOFFICE_RATE_LIMIT_METADATA_KEY = 'backoffice.rate-limit';

export const BackofficeRateLimit = (rule: BackofficeRateLimitRule) =>
  SetMetadata(BACKOFFICE_RATE_LIMIT_METADATA_KEY, rule);
