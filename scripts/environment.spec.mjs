import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalDatabase, testEnvironment } from './environment.mjs';

test('test runner never inherits application credentials or the development database', () => {
  const env = testEnvironment({
    PATH: '/system/bin',
    DATABASE_URL: 'postgresql://owner:secret@prod.supabase.co/postgres',
    DIRECT_URL: 'postgresql://owner:secret@localhost:5433/rephone_dev',
    JWT_ACCESS_SECRET: 'live-jwt',
    IDENTIFIER_ENCRYPTION_KEY: 'live-identifier',
    SUPABASE_URL: 'https://live.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'live-storage',
    SMTP_PASSWORD: 'live-mail',
    DEALER_ENABLED: 'true',
    AFFILIATE_ENABLED: 'true',
  });
  assert.equal(env.PATH, '/system/bin');
  assert.equal(env.DATABASE_URL, 'postgresql://rephone:rephone@localhost:5434/rephone_test');
  assert.equal(env.DIRECT_URL, env.DATABASE_URL);
  assert.equal(env.REPHONE_SKIP_ENV_FILE, 'true');
  assert.equal(env.DEALER_ENABLED, 'false');
  assert.equal(env.AFFILIATE_ENABLED, 'false');
  assert.ok(!JSON.stringify(env).includes('live-'));
  assert.equal(env.SMTP_PASSWORD, '');
});

test('reset targets must be local test databases, including when explicitly overridden', () => {
  for (const url of [
    'postgresql://user:pw@localhost:5433/rephone_dev',
    'postgresql://user:pw@prod.supabase.co/rephone_test',
    'postgresql://user:pw@postgres-dev/rephone_test',
    'mysql://user:pw@localhost/rephone_test',
    'postgresql://user:pw@localhost/rephone_test?host=prod.supabase.co',
    'postgresql://user:pw@localhost/rephone_test?hostaddr=203.0.113.1',
  ])
    assert.throws(() => testEnvironment({ TEST_DATABASE_URL: url }), /Refusing test operation/);
  assertLocalDatabase('postgresql://user:pw@postgres-test/rephone_test', 'test');
  assertLocalDatabase('postgresql://user:pw@localhost:5433/rephone_dev', 'dev');
  assert.throws(() => assertLocalDatabase('postgresql://user:pw@prod.supabase.co/postgres', 'dev'));
});
