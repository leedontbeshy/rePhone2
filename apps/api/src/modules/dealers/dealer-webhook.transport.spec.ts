import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import {
  isPublicWebhookAddress,
  parseWebhookUrl,
  resolveWebhookTarget,
} from './dealer-webhook.transport.js';

describe('Dealer webhook network boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.5.4',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.1.1.1',
    '198.19.0.1',
    '192.0.2.1',
    '203.0.113.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])('rejects private/reserved destination %s', (address) => {
    expect(isPublicWebhookAddress(address)).toBe(false);
  });
  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'accepts routable destination %s',
    (address) => {
      expect(isPublicWebhookAddress(address)).toBe(true);
    },
  );
  it.each([
    'http://shop.example.com/hook',
    'https://127.0.0.1/hook',
    'https://[::1]/hook',
    'https://shop.example.com:8443/hook',
    'https://a:b@shop.example.com/hook',
    'https://shop.example.com./hook',
    'https://localhost/hook',
    'https://shop.example.com/#secret',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => parseWebhookUrl(url)).toThrow();
  });
  it('rejects a mixed DNS answer instead of choosing the public address', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ] as never);
    await expect(resolveWebhookTarget('https://shop.example.com/hook')).rejects.toThrow();
  });
  it('pins the validated answer and re-resolves the next attempt', async () => {
    vi.mocked(lookup)
      .mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    expect((await resolveWebhookTarget('https://shop.example.com/hook')).pinned.address).toBe(
      '1.1.1.1',
    );
    await expect(resolveWebhookTarget('https://shop.example.com/hook')).rejects.toThrow();
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it('bounds a stalled DNS lookup before a worker lease can expire', async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockReturnValue(new Promise(() => {}) as never);
    const assertion = expect(resolveWebhookTarget('https://shop.example.com/hook')).rejects.toThrow(
      'DNS timeout',
    );
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
