import { describe, expect, it } from 'vitest';
import { buildOneTimeAuthLink } from './auth-one-time-link.js';

describe('buildOneTimeAuthLink', () => {
  it.each(['/reset-password', '/accept-invitation'] as const)(
    'places the one-time credential in the fragment for %s',
    (path) => {
      const token = 'raw_token-with-private-value';
      const link = buildOneTimeAuthLink('https://rephone.example/', path, token);

      expect(link).toBe(`https://rephone.example${path}#token=${token}`);
      expect(link).not.toContain('?token=');
    },
  );
});
