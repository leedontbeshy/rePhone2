export interface DealerApiGuideEnvironment {
  apiPublicUrl?: string | undefined;
  publicApiBaseUrl?: string | undefined;
  dealerEnvironment?: string | undefined;
  sandboxApiUrl?: string | undefined;
  sandboxWebUrl?: string | undefined;
}

export function dealerApiGuideConfiguration(environment: DealerApiGuideEnvironment) {
  const current =
    absoluteApiBaseUrl(environment.apiPublicUrl) ||
    absoluteApiBaseUrl(environment.publicApiBaseUrl);
  const test = environment.dealerEnvironment === 'TEST';
  const liveApiUrl = test ? '' : current;
  const configuredSandbox = absoluteApiBaseUrl(environment.sandboxApiUrl);
  const sandboxApiUrl = test ? current || configuredSandbox : configuredSandbox;
  return {
    liveApiUrl,
    sandboxApiUrl,
    sandboxWebUrl: environment.sandboxWebUrl?.trim().replace(/\/+$/, '') ?? '',
    currentEnvironment: test ? ('TEST' as const) : ('LIVE' as const),
    initialEnvironment: test || sandboxApiUrl !== '' ? ('TEST' as const) : ('LIVE' as const),
  };
}

export function dealerApiGuidePortalUrl(
  currentEnvironment: 'TEST' | 'LIVE',
  selectedEnvironment: 'TEST' | 'LIVE',
  sandboxWebUrl: string,
): string {
  if (currentEnvironment === selectedEnvironment) return '/dealer';
  if (selectedEnvironment === 'TEST' && sandboxWebUrl !== '') {
    return `${sandboxWebUrl.replace(/\/+$/, '')}/dealer`;
  }
  return '';
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
