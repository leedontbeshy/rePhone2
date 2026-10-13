export function databaseTargetIssue(
  connectionString: string,
  environment: string,
): string | undefined {
  if (environment === 'production') return undefined;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return 'must be a valid PostgreSQL URL';
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    [...url.searchParams.keys()].some((key) =>
      /^(host|hostaddr|port|user|password|database|dbname|service|servicefile)$/i.test(key),
    )
  )
    return 'must not override the database target through query parameters';
  const expectedHost = environment === 'test' ? 'postgres-test' : 'postgres-dev';
  const local =
    ['localhost', '::1', expectedHost].includes(hostname) || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !local || url.hash)
    return 'must target the dedicated local database';
  if (environment === 'development' && url.pathname !== '/rephone_dev')
    return 'development requires rephone_dev';
  if (environment === 'test' && !url.pathname.endsWith('_test'))
    return 'tests require a dedicated database ending _test';
  return undefined;
}
