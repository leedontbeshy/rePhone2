const DEFAULT_BROWSER_API_BASE_URL = '/api/v1';

export function resolveBrowserApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return DEFAULT_BROWSER_API_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

/**
 * Public API address used by Client Components and the browser bundle.
 * It must never depend on an internal container hostname.
 */
export const browserApiBaseUrl = resolveBrowserApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
