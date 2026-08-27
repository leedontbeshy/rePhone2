import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicStore } from './public-store-api';
import type { PublicStoreApiError } from './public-store-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public store API', () => {
  it('reads the generated public-safe store envelope without caching it', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        Response.json({
          data: {
            currency: 'VND',
            pickup: {
              address: '123 Nguyễn Văn A, TP.HCM',
              holdMinutes: 120,
              locationName: 'rePhone Quận 1',
            },
            storeAddress: '123 Nguyễn Văn A, TP.HCM',
            storeName: 'rePhone',
            storePhone: '0901234567',
            timezone: 'Asia/Ho_Chi_Minh',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPublicStore()).resolves.toMatchObject({
      storeName: 'rePhone',
      pickup: { locationName: 'rePhone Quận 1' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('maps a missing pickup store to a recoverable service error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' } },
            { status: 503 },
          ),
        ),
      ),
    );

    await expect(getPublicStore()).rejects.toEqual(
      expect.objectContaining<Partial<PublicStoreApiError>>({
        name: 'PublicStoreApiError',
        status: 503,
      }),
    );
  });
});
