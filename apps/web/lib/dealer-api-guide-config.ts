export interface DealerApiGuideEnvironment {
  apiPublicUrl?: string | undefined;
  publicApiBaseUrl?: string | undefined;
  dealerEnvironment?: string | undefined;
}

export function dealerApiGuideConfiguration(environment: DealerApiGuideEnvironment) {
  return {
    apiBaseUrl:
      absoluteApiBaseUrl(environment.apiPublicUrl) ||
      absoluteApiBaseUrl(environment.publicApiBaseUrl),
    currentEnvironment:
      environment.dealerEnvironment === 'TEST' ? ('TEST' as const) : ('LIVE' as const),
  };
}

function absoluteApiBaseUrl(value: string | undefined): string {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return '';
    }
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/api/v1') ? path : `${path}/api/v1`;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}
