import type { ValidationError } from 'class-validator';
import { ApiError, type ApiErrorDetail } from '../errors/api-error.js';

function collectValidationDetails(errors: ValidationError[], parentPath = ''): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath === '' ? error.property : `${parentPath}.${error.property}`;
    const ownDetails = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
      field,
      code: code.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
      message,
    }));
    return [...ownDetails, ...collectValidationDetails(error.children ?? [], field)];
  });
}

export function createValidationError(errors: ValidationError[]): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, collectValidationDetails(errors));
}
