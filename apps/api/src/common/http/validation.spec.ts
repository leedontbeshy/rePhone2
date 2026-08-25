import type { ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { createValidationError } from './validation.js';

describe('createValidationError', () => {
  it('flattens nested validation details and normalizes constraint codes', () => {
    const errors: ValidationError[] = [
      {
        property: 'contact',
        children: [
          {
            property: 'email',
            constraints: {
              isEmail: 'email must be valid',
              maxLength: 'email is too long',
            },
          },
        ],
      },
    ];

    expect(createValidationError(errors)).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'contact.email', code: 'IS_EMAIL', message: 'email must be valid' },
        { field: 'contact.email', code: 'MAX_LENGTH', message: 'email is too long' },
      ],
    });
  });

  it('handles a root constraint without optional children', () => {
    const errors: ValidationError[] = [
      {
        property: 'expectedVersion',
        constraints: { min: 'expectedVersion must be positive' },
      },
    ];

    expect(createValidationError(errors).details).toEqual([
      {
        field: 'expectedVersion',
        code: 'MIN',
        message: 'expectedVersion must be positive',
      },
    ]);
  });
});
