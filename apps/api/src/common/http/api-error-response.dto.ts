import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';
import type { ApiErrorCode } from '../errors/api-error.js';

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'VALIDATION_FAILED',
  'MALFORMED_JSON',
  'AUTH_REQUIRED',
  'ACCESS_TOKEN_INVALID',
  'INVALID_CREDENTIALS',
  'SESSION_REVOKED',
  'ACCOUNT_UNAVAILABLE',
  'FORBIDDEN',
  'CSRF_VALIDATION_FAILED',
  'RESOURCE_NOT_FOUND',
  'DUPLICATE_RESOURCE',
  'CONCURRENT_MODIFICATION',
  'ONE_TIME_TOKEN_INVALID',
  'CURRENT_PASSWORD_INCORRECT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
  'INTERNAL_ERROR',
];

export class ApiErrorDetailDto {
  @ApiPropertyOptional({ type: String })
  public field?: string;

  @ApiProperty({ type: String })
  public code!: string;

  @ApiProperty({ type: String })
  public message!: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ type: String, enum: API_ERROR_CODES })
  public code!: ApiErrorCode;

  @ApiProperty({ type: String })
  public message!: string;

  @ApiProperty({ type: () => [ApiErrorDetailDto] })
  public details!: ApiErrorDetailDto[];

  @ApiProperty({ type: String, description: 'Correlation ID for diagnostics' })
  public requestId!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: () => ApiErrorBodyDto })
  public error!: ApiErrorBodyDto;
}

interface ApiErrorResponseDefinition {
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;
  description: string;
}

export function ApiErrorResponses(...definitions: ApiErrorResponseDefinition[]) {
  return applyDecorators(
    ...definitions.map((definition) =>
      ApiResponse({
        status: definition.status,
        description: definition.description,
        type: ApiErrorResponseDto,
        ...(definition.status === 429
          ? {
              headers: {
                'Retry-After': {
                  description: 'Seconds until the current rate-limit window permits a retry.',
                  schema: { type: 'integer', minimum: 1 },
                },
              },
            }
          : {}),
      }),
    ),
  );
}
