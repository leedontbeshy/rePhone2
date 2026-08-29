import 'server-only';

const DEFAULT_SERVER_API_BASE_URL = 'http://localhost:4000/api/v1';

export function resolveServerApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_SERVER_API_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('API_INTERNAL_BASE_URL phải là địa chỉ HTTP(S) tuyệt đối.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API_INTERNAL_BASE_URL phải sử dụng giao thức HTTP hoặc HTTPS.');
  }

  return candidate.replace(/\/+$/, '');
}

/**
 * Private API address used only while rendering on the Next.js server.
 * Docker sets this to the API service hostname; it must not enter the client bundle.
 */
export const serverApiBaseUrl = resolveServerApiBaseUrl(process.env.API_INTERNAL_BASE_URL);
