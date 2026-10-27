import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudProxyConfig } from '../apps/web/lib/cloud-proxy.mjs';

test('cloud proxy preserves API/cookie paths without intercepting the web health route', async () => {
  const config = cloudProxyConfig({
    NODE_ENV: 'production',
    API_PROXY_ORIGIN: 'https://api.example.org/',
  });
  const rewrites = await config.rewrites();
  assert.deepEqual(rewrites[1], {
    source: '/api/v1/:path*',
    destination: 'https://api.example.org/api/v1/:path*',
  });
  assert.equal(
    rewrites.some((route) => route.source === '/api/health'),
    false,
  );
  assert.ok(
    (await config.headers()).every((route) =>
      route.headers.some((header) => header.value === 'private, no-store'),
    ),
  );
});

test('cloud demo requires an HTTPS origin and does not expose credentials through a rewrite', () => {
  assert.throws(() => cloudProxyConfig({ NEXT_PUBLIC_DEMO_MODE: 'true' }), /API_PROXY_ORIGIN/);
  for (const origin of [
    'http://api.example.org',
    'https://user:secret@api.example.org',
    'https://api.example.org/api/v1',
    'https://api.example.org?x=1',
  ]) {
    assert.throws(() => cloudProxyConfig({ NODE_ENV: 'production', API_PROXY_ORIGIN: origin }));
  }
  assert.deepEqual(cloudProxyConfig({}), {});
});
