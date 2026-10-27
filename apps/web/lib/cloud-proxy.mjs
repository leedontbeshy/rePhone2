export function cloudProxyConfig(env) {
  const value = env.API_PROXY_ORIGIN?.trim();
  if (!value) {
    if (env.NEXT_PUBLIC_DEMO_MODE === 'true')
      throw new Error('API_PROXY_ORIGIN is required for the cloud demo.');
    return {};
  }
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && loopback && env.NODE_ENV !== 'production'))
  ) {
    throw new Error('API_PROXY_ORIGIN must be an HTTPS origin without credentials, path or query.');
  }
  const paths = ['/api/v1', '/api/v1/:path*', '/health/ready', '/health/live'];
  return {
    async rewrites() {
      return paths.map((source) => ({ source, destination: `${url.origin}${source}` }));
    },
    async headers() {
      return paths.map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'x-vercel-enable-rewrite-caching', value: '0' },
        ],
      }));
    },
  };
}
