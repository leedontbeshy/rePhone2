import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalTestTarget } from './local-test-target.mjs';

const base = {
  NODE_ENV: 'test',
  REPHONE_AFFILIATE_TEST: 'true',
  DATABASE_URL: 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_test',
  DIRECT_URL: 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_test',
  API_PUBLIC_URL: 'http://localhost:4001',
  WEB_PUBLIC_URL: 'http://localhost:3001',
};

test('allows the fixed host database and explicit Docker-local target', () => {
  assert.doesNotThrow(() => assertLocalTestTarget(base));
  const url = 'postgresql://rephone:rephone@postgres-test:5432/rephone_test';
  assert.doesNotThrow(() =>
    assertLocalTestTarget({
      ...base,
      REPHONE_LOCAL_DOCKER: 'true',
      DATABASE_URL: url,
      DIRECT_URL: url,
    }),
  );
  assert.throws(() => assertLocalTestTarget({ ...base, DATABASE_URL: url, DIRECT_URL: url }));
});

test('refuses remote, live, sandbox and mismatched migration databases before boot', () => {
  for (const url of [
    'postgresql://rephone:rephone@project.supabase.co:5432/rephone_test',
    'postgresql://rephone:rephone@postgres-test:5432/postgres',
    'postgresql://rephone:rephone@127.0.0.1:5433/rephone_dealer_sandbox',
    'postgresql://rephone:rephone@127.0.0.1:5432/rephone_test',
    'postgresql://rephone:rephone@127.0.0.1:5433/rephone_test?host=remote.example.com',
    'https://rephone:rephone@127.0.0.1:5433/rephone_test',
  ])
    assert.throws(() =>
      assertLocalTestTarget({
        ...base,
        REPHONE_LOCAL_DOCKER: 'true',
        DATABASE_URL: url,
        DIRECT_URL: url,
      }),
    );
  assert.throws(() =>
    assertLocalTestTarget({ ...base, DIRECT_URL: 'postgresql://remote/postgres' }),
  );
  assert.throws(() => assertLocalTestTarget({ ...base, NODE_ENV: 'production' }));
  assert.throws(() => assertLocalTestTarget({ ...base, REPHONE_AFFILIATE_TEST: 'false' }));
});

test('only emits local public links and accepts alternate loopback ports', () => {
  assert.doesNotThrow(() =>
    assertLocalTestTarget({ ...base, API_PUBLIC_URL: 'http://127.0.0.1:4101' }),
  );
  for (const name of ['API_PUBLIC_URL', 'WEB_PUBLIC_URL']) {
    for (const url of [
      'https://example.com',
      'http://user:secret@localhost:3001',
      'http://localhost:3001/path',
      'http://localhost:3001?x=1',
    ]) {
      assert.throws(() => assertLocalTestTarget({ ...base, [name]: url }));
    }
  }
});
