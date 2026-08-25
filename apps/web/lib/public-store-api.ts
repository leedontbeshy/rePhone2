import { createApiClient, type components } from '@rephone/api-client';
import { apiBaseUrl } from './api';

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

const publicStoreClient = createApiClient({ baseUrl: apiBaseUrl, fetch: noStoreFetch });

export type PublicStore = components['schemas']['PublicStoreDto'];

export class PublicStoreApiError extends Error {
  public constructor(public readonly status: number) {
    super(
      status === 503
        ? 'Thông tin cửa hàng đang tạm gián đoạn.'
        : 'Không thể tải thông tin cửa hàng lúc này.',
    );
    this.name = 'PublicStoreApiError';
  }
}

export async function getPublicStore(): Promise<PublicStore> {
  const result = await publicStoreClient.GET('/api/v1/store');
  if (result.data === undefined) {
    throw new PublicStoreApiError(result.response.status);
  }
  return result.data.data;
}
