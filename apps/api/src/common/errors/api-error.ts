export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'MALFORMED_JSON'
  | 'AUTH_REQUIRED'
  | 'ACCESS_TOKEN_INVALID'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'CSRF_VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'DUPLICATE_RESOURCE'
  | 'INVALID_STATE_TRANSITION'
  | 'CONCURRENT_MODIFICATION'
  | 'INVENTORY_NOT_AVAILABLE'
  | 'INVENTORY_INSPECTION_REQUIRED'
  | 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET'
  | 'ONE_TIME_TOKEN_INVALID'
  | 'CURRENT_PASSWORD_INCORRECT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  public constructor(
    public readonly code: ApiErrorCode,
    message?: string,
    public readonly details: ApiErrorDetail[] = [],
    public readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
