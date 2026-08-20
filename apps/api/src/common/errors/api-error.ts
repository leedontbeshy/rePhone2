export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'MALFORMED_JSON'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
