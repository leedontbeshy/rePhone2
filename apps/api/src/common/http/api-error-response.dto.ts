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
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'DUPLICATE_RESOURCE',
  'INVALID_STATE_TRANSITION',
  'ORDER_NOT_FULLY_PAID',
  'RESERVATION_EXPIRED',
  'CONCURRENT_MODIFICATION',
  'INVENTORY_NOT_AVAILABLE',
  'INVENTORY_INSPECTION_REQUIRED',
  'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
  'CART_NOT_ACTIVE',
  'CART_EMPTY',
  'CART_NOT_FULFILLABLE',
  'CART_ITEM_QUANTITY_FIXED',
  'CHECKOUT_REVIEW_REQUIRED',
  'ORDER_NOT_FOUND',
  'VOUCHER_NOT_APPLICABLE',
  'VOUCHER_USAGE_LIMIT_REACHED',
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

  @ApiPropertyOptional({ type: Object })
  public current?: unknown;
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
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 503;
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
