export type OneTimeAuthPath = '/accept-invitation' | '/reset-password';

export function buildOneTimeAuthLink(
  webPublicUrl: string,
  path: OneTimeAuthPath,
  rawToken: string,
): string {
  const url = new URL(path, `${webPublicUrl.replace(/\/$/, '')}/`);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}
