import { describe, expect, it } from 'vitest';
import { shouldEnableSwaggerUi } from './swagger-ui-policy.js';

describe('shouldEnableSwaggerUi', () => {
  it('allows Swagger UI only when explicitly enabled in development', () => {
    expect(shouldEnableSwaggerUi('development')).toBe(true);
    expect(shouldEnableSwaggerUi('development', false)).toBe(false);
    expect(shouldEnableSwaggerUi('test', true)).toBe(false);
    expect(shouldEnableSwaggerUi('production', true)).toBe(false);
  });
});
