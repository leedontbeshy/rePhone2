export function safeHttpsUrl(value: string | null): string | null {
  if (value === null || value.length === 0 || /\s/u.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
      ? value
      : null;
  } catch {
    return null;
  }
}
