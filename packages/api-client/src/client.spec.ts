import { describe, expect, it, vi } from 'vitest';
import type { paths } from './schema.js';
import { createApiClient } from './client.js';

type ProductMediaUploadBody =
  paths['/api/v1/backoffice/products/{id}/media']['post']['requestBody']['content']['multipart/form-data'];

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
  it('types product media uploads as binary data', () => {
    const body: ProductMediaUploadBody = {
      file: new Blob(['product image'], { type: 'image/webp' }),
    };

    expect(body.file).toBeInstanceOf(Blob);
  });

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
    expect(refreshAccessToken).toHaveBeenCalledWith('expired-token');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('replays through browser fetch with the global invocation context', async () => {
    let accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof globalThis.fetch>(function (this: unknown, input, init) {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.headers.get('Authorization') === 'Bearer fresh-token') {
        expect(this).toBe(globalThis);
        return Promise.resolve(jsonResponse(accountPayload, 200));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
      refreshAccessToken: () => {
        accessToken = 'fresh-token';
        return Promise.resolve(accessToken);
      },
      fetch: fetchMock,
    });

    const result = await client.GET('/api/v1/account');

    expect(result.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh or replay a late 401 after the active identity changes', async () => {
    let accessToken = 'session-a-token';
    let releaseResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((resolve) => {
          releaseResponse = resolve;
        }),
    );
    const refreshAccessToken = vi.fn(() => Promise.resolve('refreshed-session-a-token'));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
      refreshAccessToken,
      onUnauthorized,
      fetch: fetchMock,
    });

    const oldIdentityRequest = client.GET('/api/v1/account');
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    accessToken = 'session-b-token';
    releaseResponse?.(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));

    const result = await oldIdentityRequest;
    expect(result.response.status).toBe(401);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('replays a late 401 from the token generation that just refreshed', async () => {
    let accessToken = 'expired-token';
    const originalResponses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>((input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.headers.get('Authorization') === 'Bearer fresh-token') {
        return Promise.resolve(jsonResponse(accountPayload, 200));
      }
      return new Promise<Response>((resolve) => {
        originalResponses.push(resolve);
      });
    });
    const refreshAccessToken = vi.fn((expectedAccessToken?: string) => {
      expect(expectedAccessToken).toBe('expired-token');
      accessToken = 'fresh-token';
      return Promise.resolve(accessToken);
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
      refreshAccessToken,
      fetch: fetchMock,
    });

    const first = client.GET('/api/v1/account');
    const second = client.GET('/api/v1/account');
    await vi.waitFor(() => {
      expect(originalResponses).toHaveLength(2);
    });

    originalResponses[0]?.(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
    await expect(first).resolves.toMatchObject({ response: { status: 200 } });
    expect(accessToken).toBe('fresh-token');

    originalResponses[1]?.(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
    await expect(second).resolves.toMatchObject({ response: { status: 200 } });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not use a prior refresh transition after a subsequent identity change', async () => {
    let accessToken = 'session-a-expired';
    const originalResponses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>((input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.headers.get('Authorization') === 'Bearer session-a-fresh') {
        return Promise.resolve(jsonResponse(accountPayload, 200));
      }
      return new Promise<Response>((resolve) => {
        originalResponses.push(resolve);
      });
    });
    const refreshAccessToken = vi.fn(() => {
      accessToken = 'session-a-fresh';
      return Promise.resolve(accessToken);
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
      refreshAccessToken,
      fetch: fetchMock,
    });

    const first = client.GET('/api/v1/account');
    const late = client.GET('/api/v1/account');
    await vi.waitFor(() => {
      expect(originalResponses).toHaveLength(2);
    });
    originalResponses[0]?.(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
    await expect(first).resolves.toMatchObject({ response: { status: 200 } });

    accessToken = 'session-b-token';
    originalResponses[1]?.(jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401));
    await expect(late).resolves.toMatchObject({ response: { status: 401 } });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refresh auth endpoints or replay a protected request more than once', async () => {
    let accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(jsonResponse({ error: { code: 'SESSION_REVOKED' } }, 401)),
    );
    const refreshAccessToken = vi.fn(() => {
      accessToken = 'still-invalid';
      return Promise.resolve(accessToken);
    });
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: () => accessToken,
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
