import { createApiClient } from '@rephone/api-client';

const baseUrl =
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000/api/v1';

export const apiClient = createApiClient({ baseUrl });
