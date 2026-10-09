import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { ApiError } from '../../common/errors/api-error.js';

export function isPublicWebhookAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    const c = parts[2] ?? 0;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only global unicast IPv6. Exclude documentation, transition and mapped-address ranges.
  const lower = address.toLowerCase();
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/.test(lower) &&
    !lower.startsWith('2001:') &&
    !lower.startsWith('2002:') &&
    !lower.startsWith('3fff:')
  );
}

export function parseWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Địa chỉ webhook không hợp lệ.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 ||
    url.hostname.endsWith('.') ||
    !url.hostname.includes('.')
  )
    throw new ApiError(
      'VALIDATION_FAILED',
      'Webhook cần tên miền HTTPS công khai, cổng 443 và không có thông tin đăng nhập.',
    );
  return url;
}

export async function resolveWebhookTarget(value: string) {
  const url = parseWebhookUrl(value);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Webhook DNS timeout'));
      }, 5000);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicWebhookAddress(address)))
    throw new ApiError(
      'VALIDATION_FAILED',
      'Webhook không được trỏ đến mạng riêng hoặc địa chỉ dành riêng.',
    );
  const pinned = addresses[0];
  if (pinned === undefined) throw new ApiError('VALIDATION_FAILED');
  return { url, pinned };
}

/** Resolve again for every attempt; pin the validated IP to this TLS connection. Never follow redirects. */
export async function sendDealerWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<number> {
  const target = await resolveWebhookTarget(url);
  return new Promise<number>((resolve, reject) => {
    const req = request(
      target.url,
      {
        method: 'POST',
        agent: false,
        servername: target.url.hostname,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, target.pinned.address, target.pinned.family);
        },
      },
      (response) => {
        const code = response.statusCode ?? 0;
        response.destroy();
        resolve(code);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Webhook timed out')), 5_000);
    req.once('close', () => {
      clearTimeout(timer);
    });
    req.once('error', reject);
    req.end(body);
  });
}
