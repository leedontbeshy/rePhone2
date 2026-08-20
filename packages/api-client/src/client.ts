import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
  refreshAccessToken?: () => Promise<string | undefined>;
  onUnauthorized?: () => void | Promise<void>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: normalizeBaseUrl(options.baseUrl),
    credentials: 'include',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  const replayRequests = new Map<string, Request>();
  let refreshPromise: Promise<string | undefined> | undefined;

  const refreshOnce = (): Promise<string | undefined> => {
    if (refreshPromise === undefined) {
      refreshPromise = (options.refreshAccessToken?.() ?? Promise.resolve(undefined)).finally(
        () => {
          refreshPromise = undefined;
        },
      );
    }
    return refreshPromise;
  };

  const authenticationMiddleware: Middleware = {
    onRequest({ id, request }) {
      const accessToken = options.getAccessToken?.();
      if (accessToken !== undefined) {
        request.headers.set('Authorization', `Bearer ${accessToken}`);
      }
      replayRequests.set(id, request.clone());
      return request;
    },
    async onResponse({ id, options: requestOptions, response, schemaPath }) {
      const replayRequest = replayRequests.get(id);
      replayRequests.delete(id);
      if (response.status !== 401 || schemaPath.startsWith('/api/v1/auth/')) {
        return response;
      }
      if (replayRequest === undefined || options.refreshAccessToken === undefined) {
        await options.onUnauthorized?.();
        return response;
      }

      const accessToken = await refreshOnce();
      if (accessToken === undefined) {
        await options.onUnauthorized?.();
        return response;
      }

      replayRequest.headers.set('Authorization', `Bearer ${accessToken}`);
      const replayResponse = await requestOptions.fetch(replayRequest);
      if (replayResponse.status === 401) {
        await options.onUnauthorized?.();
      }
      return replayResponse;
    },
    onError({ error, id }) {
      replayRequests.delete(id);
      return error instanceof Error ? error : new Error('API request failed', { cause: error });
    },
  };

  client.use(authenticationMiddleware);
  return client;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}
