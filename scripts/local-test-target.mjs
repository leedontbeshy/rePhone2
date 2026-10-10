// Shared guard for the local adapter server. A container opt-in never permits remote data.
export function assertLocalTestTarget(env) {
  const target = new URL(env.DATABASE_URL ?? 'postgresql://invalid/invalid');
  const hostTarget = target.hostname === '127.0.0.1' && target.port === '5433';
  const dockerTarget =
    env.REPHONE_LOCAL_DOCKER === 'true' &&
    target.hostname === 'postgres-test' &&
    target.port === '5432';
  if (
    env.NODE_ENV !== 'test' ||
    env.REPHONE_AFFILIATE_TEST !== 'true' ||
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.search ||
    target.hash ||
    (!hostTarget && !dockerTarget) ||
    target.pathname !== '/rephone_test' ||
    env.DIRECT_URL !== env.DATABASE_URL
  ) {
    throw new Error('Local test server requires the isolated rephone_test database');
  }
  for (const name of ['API_PUBLIC_URL', 'WEB_PUBLIC_URL']) {
    const url = new URL(env[name]);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error(`${name} must be a local HTTP origin`);
  }
}
