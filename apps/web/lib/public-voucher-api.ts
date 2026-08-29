import 'server-only';

import { createApiClient, type components, type paths } from '@rephone/api-client';
import { serverApiBaseUrl } from './server-api';

const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

const publicVoucherClient = createApiClient({ baseUrl: serverApiBaseUrl, fetch: noStoreFetch });

export type PublicVoucher = components['schemas']['PublicVoucherDto'];
export type PublicVoucherListResponse = components['schemas']['PublicVoucherListResponse'];
type PublicVoucherQuery = NonNullable<paths['/api/v1/vouchers']['get']['parameters']['query']>;

export class PublicVoucherApiError extends Error {
  public constructor(public readonly status: number) {
    super('Không thể tải ưu đãi lúc này.');
    this.name = 'PublicVoucherApiError';
  }
}

export async function listPublicVouchers(
  query: PublicVoucherQuery,
): Promise<PublicVoucherListResponse> {
  const result = await publicVoucherClient.GET('/api/v1/vouchers', { params: { query } });
  if (result.data === undefined) throw new PublicVoucherApiError(result.response.status);
  return result.data;
}
