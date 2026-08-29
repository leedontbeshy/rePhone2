import { describe, expect, it } from 'vitest';
import { resolveServerApiBaseUrl } from './server-api';

describe('server API configuration', () => {
  it('uses the host API during development when no internal address is configured', () => {
    expect(resolveServerApiBaseUrl(undefined)).toBe('http://localhost:4000/api/v1');
  });

  it('accepts a private Docker service address', () => {
    expect(resolveServerApiBaseUrl(' http://api:4000/api/v1/ ')).toBe('http://api:4000/api/v1');
  });

  it.each(['api:4000/api/v1', '/api/v1', 'ftp://api/api/v1'])(
    'rejects an unsafe internal address: %s',
    (value) => {
      expect(() => resolveServerApiBaseUrl(value)).toThrow(/HTTP/);
    },
  );
});
