import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

const accountPayload = {
  data: {
    id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
    email: 'customer@example.com',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    fullName: 'Customer',
    phone: null,
    emailVerifiedAt: null,
  },
};

describe('createApiClient', () => {
  it('coordinates one refresh and replays concurrent requests once', async () => {
    let accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof globalThis.fetch>((input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.headers.get('Authorization') !== 'Bearer fresh-token') {
        return Promise.resolve(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
      }
      return Promise.resolve(jsonResponse(accountPayload, 200));
    });
    const refreshAccessToken = vi.fn(async () => {
      await Promise.resolve();
      accessToken = 'fresh-token';
      return accessToken;
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
      refreshAccessToken,
      fetch: fetchMock,
    });

    const [first, second] = await Promise.all([
      client.GET('/api/v1/account'),
      client.GET('/api/v1/account'),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not refresh auth endpoints or replay a protected request more than once', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(jsonResponse({ error: { code: 'SESSION_REVOKED' } }, 401)),
    );
    const refreshAccessToken = vi.fn(() => Promise.resolve('still-invalid'));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => 'expired-token',
      refreshAccessToken,
      onUnauthorized,
      fetch: fetchMock,
    });

    const protectedResponse = await client.GET('/api/v1/account');
    const loginResponse = await client.POST('/api/v1/auth/login', {
      body: { email: 'customer@example.com', password: 'Customer123' },
    });

    expect(protectedResponse.response.status).toBe(401);
    expect(loginResponse.response.status).toBe(401);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
