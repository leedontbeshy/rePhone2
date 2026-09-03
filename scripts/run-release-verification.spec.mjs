import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTestDatabaseUrl, containerCleanupAction } from './run-release-verification.mjs';

test('release database guard rejects a non-test target before any command runs', () => {
  assert.throws(
    () => assertTestDatabaseUrl('postgresql://rephone:rephone@localhost:5433/rephone'),
    /non-test database rephone/,
  );
  assert.doesNotThrow(() =>
    assertTestDatabaseUrl('postgresql://rephone:rephone@localhost:5433/rephone_test'),
  );
  assert.throws(
    () => assertTestDatabaseUrl('postgresql://rephone:rephone@db.example.com:5432/rephone_test'),
    /remote database host db\.example\.com/,
  );
});

test('release cleanup restores the exact container state observed before the run', () => {
  assert.equal(
    containerCleanupAction({
      externalDatabaseUrl: undefined,
      existingContainerId: '',
      runningContainerId: '',
    }),
    'remove',
  );
  assert.equal(
    containerCleanupAction({
      externalDatabaseUrl: undefined,
      existingContainerId: 'existing-id',
      runningContainerId: '',
    }),
    'stop',
  );
  assert.equal(
    containerCleanupAction({
      externalDatabaseUrl: undefined,
      existingContainerId: 'existing-id',
      runningContainerId: 'existing-id',
    }),
    'none',
  );
  assert.equal(
    containerCleanupAction({
      externalDatabaseUrl: 'postgresql://rephone:rephone@localhost:5432/rephone_test',
      existingContainerId: '',
      runningContainerId: '',
    }),
    'none',
  );
});
