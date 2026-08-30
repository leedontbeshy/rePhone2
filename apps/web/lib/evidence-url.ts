const LOCAL_EVIDENCE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertSafeEvidenceUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Không thể mở minh chứng lúc này.');
  }

  const isSecure = parsed.protocol === 'https:';
  const isLocalDevelopment =
    parsed.protocol === 'http:' && LOCAL_EVIDENCE_HOSTS.has(parsed.hostname);
  if (
    (!isSecure && !isLocalDevelopment) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error('Không thể mở minh chứng lúc này.');
  }

  return parsed;
}
