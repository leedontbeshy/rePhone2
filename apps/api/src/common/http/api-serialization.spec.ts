import { HttpStatus, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors/api-error.js';
import { serializeApiError } from './api-exception.filter.js';
import { serializeApiResponse } from './api-response.interceptor.js';

describe('API serialization', () => {
  const requestId = '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1';

  it('wraps successful application data once', () => {
    expect(serializeApiResponse({ id: 'resource-id' })).toEqual({
      data: { id: 'resource-id' },
    });
  });

  it('serializes domain errors without internal fields', () => {
    const result = serializeApiError(
      new ApiError('VALIDATION_FAILED', undefined, [
        { field: 'email', code: 'INVALID_EMAIL', message: 'Email không hợp lệ.' },
      ]),
      requestId,
    );

    expect(result).toEqual({
      status: HttpStatus.BAD_REQUEST,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Dữ liệu yêu cầu không hợp lệ.',
          details: [{ field: 'email', code: 'INVALID_EMAIL', message: 'Email không hợp lệ.' }],
          requestId,
        },
      },
    });
  });

  it('maps framework not-found errors to the stable public code', () => {
    expect(serializeApiError(new NotFoundException('internal detail'), requestId)).toMatchObject({
      status: HttpStatus.NOT_FOUND,
      body: { error: { code: 'RESOURCE_NOT_FOUND', requestId } },
    });
  });
});
