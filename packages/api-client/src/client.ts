import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
  onUnauthorized?: () => void | Promise<void>;
}

export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: 'include',
  });

  const authenticationMiddleware: Middleware = {
    onRequest({ request }) {
      const accessToken = options.getAccessToken?.();
      if (accessToken !== undefined) {
        request.headers.set('Authorization', `Bearer ${accessToken}`);
      }
      return request;
    },
    async onResponse({ response }) {
      if (response.status === 401) {
        await options.onUnauthorized?.();
      }
      return response;
    },
  };

  client.use(authenticationMiddleware);
  return client;
}
