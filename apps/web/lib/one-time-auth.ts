const ONE_TIME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,512}$/;

export function consumeFragmentToken(hash: string, clearFragment: () => void): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? undefined;
  clearFragment();
  return token !== undefined && ONE_TIME_TOKEN_PATTERN.test(token) ? token : undefined;
}
