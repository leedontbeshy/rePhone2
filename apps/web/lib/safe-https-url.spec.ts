import { describe, expect, it } from 'vitest';
import { safeHttpsUrl } from './safe-https-url';

describe('safeHttpsUrl', () => {
  it('keeps HTTPS tracking URLs without authority credentials', () => {
    expect(safeHttpsUrl('https://tracking.example/parcel/TRACK-09?note=user@example.com')).toBe(
      'https://tracking.example/parcel/TRACK-09?note=user@example.com',
    );
  });

  it.each([
    'http://tracking.example/TRACK-09',
    'https://carrier-user@tracking.example/TRACK-09',
    'https://carrier-user:carrier-password@tracking.example/TRACK-09',
    'https://tracking.example/TRACK 09',
  ])('rejects unsafe tracking URL %s', (value) => {
    expect(safeHttpsUrl(value)).toBeNull();
  });
});
