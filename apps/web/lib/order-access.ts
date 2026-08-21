const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function orderTokenStorageKey(orderNumber: string): string {
  return `rephone_order_token:${orderNumber}`;
}

export function captureGuestOrderToken(
  orderNumber: string,
  hash: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? undefined;
  if (token !== undefined && TOKEN_PATTERN.test(token)) {
    storage.setItem(orderTokenStorageKey(orderNumber), token);
    return token;
  }
  const stored = storage.getItem(orderTokenStorageKey(orderNumber)) ?? undefined;
  return stored !== undefined && TOKEN_PATTERN.test(stored) ? stored : undefined;
}

export function apiError(value: unknown, fallback: string): string {
  if (
    isRecord(value) &&
    isRecord(value['error']) &&
    typeof value['error']['message'] === 'string'
  ) {
    return value['error']['message'];
  }
  return fallback;
}

export function checkoutChangedPreview(value: unknown): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value['error']) ||
    value['error']['code'] !== 'CHECKOUT_REVIEW_REQUIRED'
  ) {
    return undefined;
  }
  const details: unknown = value['error']['details'];
  if (!Array.isArray(details)) return undefined;
  const detail: unknown = (details as unknown[]).find(
    (candidate) => isRecord(candidate) && candidate['code'] === 'CHECKOUT_CHANGED',
  );
  return isRecord(detail) ? detail['current'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
