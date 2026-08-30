import { type components, type createApiClient } from '@rephone/api-client';
import { systemError } from './system-admin-api';

export type BackofficeOverviewApiClient = ReturnType<typeof createApiClient>;
export type BackofficeOverviewSnapshot = components['schemas']['OperationsOverviewDto'];

export async function getBackofficeOverview(
  client: BackofficeOverviewApiClient,
  signal?: AbortSignal,
): Promise<BackofficeOverviewSnapshot> {
  const result = await client.GET('/api/v1/backoffice/overview', {
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  });
  if (result.data === undefined) {
    throw systemError(result.error, 'Không thể tải tổng quan vận hành.');
  }
  return result.data.data;
}
