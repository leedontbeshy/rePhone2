import { describe, expect, it } from 'vitest';
import { databaseTargetIssue } from './database-target.js';
import { databaseUrlSecurityIssue } from './database-url-security.js';

describe('local database isolation', () => {
  it.each([
    'postgresql://owner:secret@localhost:5433/rephone_dev',
    'postgresql://owner:secret@prod.supabase.co/rephone_test',
    'postgresql://owner:secret@localhost/rephone_test?host=prod.supabase.co',
    'postgresql://owner:secret@localhost/rephone_test?hostaddr=203.0.113.1',
    'postgresql://owner:secret@localhost/rephone_test?port=5433',
    'postgresql://owner:secret@localhost/rephone_test?dbname=rephone_dev',
  ])('rejects unsafe test targets before connecting: %s', (url) => {
    expect(databaseTargetIssue(url, 'test')).toBeDefined();
  });

  it('accepts the dedicated Docker databases in the matching environment', () => {
    expect(
      databaseTargetIssue('postgresql://rephone:rephone@postgres-dev/rephone_dev', 'development'),
    ).toBeUndefined();
    expect(
      databaseTargetIssue('postgresql://rephone:rephone@postgres-test/rephone_test', 'test'),
    ).toBeUndefined();
    expect(
      databaseTargetIssue('postgresql://rephone:rephone@postgres-dev/rephone_dev', 'test'),
    ).toBeDefined();
  });

  it('does not let a query override bypass TLS or point a local URL at a remote server', () => {
    expect(
      databaseUrlSecurityIssue(
        'postgresql://owner:secret@localhost/rephone_dev?host=prod.supabase.co',
        { allowUnencryptedLoopback: true },
      ),
    ).toBeDefined();
  });
});
