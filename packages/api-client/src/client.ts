import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
  refreshAccessToken?: (expectedAccessToken?: string) => Promise<string | undefined>;
  onUnauthorized?: () => void | Promise<void>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: normalizeBaseUrl(options.baseUrl),
    credentials: 'include',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  const replayRequests = new Map<string, { accessToken: string | undefined; request: Request }>();
  let refreshInFlight:
    { expectedAccessToken: string | undefined; promise: Promise<string | undefined> } | undefined;
  let lastRefreshTransition: { from: string | undefined; to: string } | undefined;

  const refreshOnce = (expectedAccessToken: string | undefined): Promise<string | undefined> => {
    if (refreshInFlight !== undefined) {
      return refreshInFlight.expectedAccessToken === expectedAccessToken
        ? refreshInFlight.promise
        : Promise.resolve(undefined);
    }

    const promise = (
      options.refreshAccessToken?.(expectedAccessToken) ?? Promise.resolve(undefined)
    ).finally(() => {
      if (refreshInFlight?.promise === promise) refreshInFlight = undefined;
    });
    refreshInFlight = { expectedAccessToken, promise };
    return promise;
  };

  const authenticationMiddleware: Middleware = {
    onRequest({ id, request }) {
      const accessToken = options.getAccessToken?.();
      if (accessToken !== undefined) {
        request.headers.set('Authorization', `Bearer ${accessToken}`);
      }
      replayRequests.set(id, { accessToken, request: request.clone() });
      return request;
    },
    async onResponse({ id, options: requestOptions, response, schemaPath }) {
      const replay = replayRequests.get(id);
      replayRequests.delete(id);
      if (response.status !== 401 || schemaPath.startsWith('/api/v1/auth/')) {
        return response;
      }
      if (replay === undefined || options.refreshAccessToken === undefined) {
        await options.onUnauthorized?.();
        return response;
      }

      const replayWith = async (accessToken: string): Promise<Response> => {
        replay.request.headers.set('Authorization', `Bearer ${accessToken}`);
        const replayResponse = await requestOptions.fetch.call(globalThis, replay.request);
        if (replayResponse.status === 401 && options.getAccessToken?.() === accessToken) {
          await options.onUnauthorized?.();
        }
        return replayResponse;
      };

      const currentAccessToken = options.getAccessToken?.();
      if (currentAccessToken !== replay.accessToken) {
        const transition = lastRefreshTransition;
        if (
          transition !== undefined &&
          transition.from === replay.accessToken &&
          transition.to === currentAccessToken
        ) {
          return replayWith(transition.to);
        }
        return response;
      }
      if (
        refreshInFlight !== undefined &&
        refreshInFlight.expectedAccessToken !== replay.accessToken
      ) {
        return response;
      }

      const accessToken = await refreshOnce(replay.accessToken);
      if (accessToken === undefined) {
        if (options.getAccessToken?.() === replay.accessToken) await options.onUnauthorized?.();
        return response;
      }
      if (options.getAccessToken?.() !== accessToken) return response;

      lastRefreshTransition = { from: replay.accessToken, to: accessToken };
      return replayWith(accessToken);
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
