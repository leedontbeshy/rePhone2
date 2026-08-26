export function toPhoneHref(phone: string): string | null {
  const normalized = phone.trim().replace(/[^+\d]/g, '');
  return normalized.length === 0 ? null : `tel:${normalized}`;
}

export function toMapSearchHref(address: string): string | null {
  const normalized = address.trim();
  if (normalized.length === 0) return null;

  const query = new URLSearchParams({ api: '1', query: normalized });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}
