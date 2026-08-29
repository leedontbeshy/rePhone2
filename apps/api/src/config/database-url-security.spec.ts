import { describe, expect, it } from 'vitest';
import { databaseUrlSecurityIssue } from './database-url-security.js';

describe('databaseUrlSecurityIssue', () => {
  it('accepts encrypted PostgreSQL URLs', () => {
    expect(
      databaseUrlSecurityIssue(
        'postgresql://runtime:secret@pooler.example.com:5432/postgres?sslmode=verify-full',
        { allowUnencryptedLoopback: false },
      ),
    ).toBeUndefined();
  });

  it('requires hostname and certificate verification when requested', () => {
    expect(
      databaseUrlSecurityIssue(
        'postgresql://runtime:secret@pooler.example.com:5432/postgres?uselibpqcompat=true&sslmode=require',
        { allowUnencryptedLoopback: false, requireCertificateVerification: true },
      ),
    ).toMatch(/verify-full/);
  });

  it('rejects a remote URL without an explicit TLS mode', () => {
    expect(
      databaseUrlSecurityIssue('postgresql://runtime:secret@pooler.example.com:5432/postgres', {
        allowUnencryptedLoopback: true,
      }),
    ).toMatch(/TLS/);
  });

  it('rejects duplicate sslmode parameters instead of trusting the first value', () => {
    expect(
      databaseUrlSecurityIssue(
        'postgresql://runtime:secret@pooler.example.com:5432/postgres?sslmode=require&sslmode=disable',
        { allowUnencryptedLoopback: false },
      ),
    ).toMatch(/TLS/);
  });

  it('allows an unencrypted loopback URL only when explicitly enabled', () => {
    const connectionString = 'postgresql://rephone:rephone@127.0.0.1:5433/rephone_test';

    expect(
      databaseUrlSecurityIssue(connectionString, { allowUnencryptedLoopback: true }),
    ).toBeUndefined();
    expect(databaseUrlSecurityIssue(connectionString, { allowUnencryptedLoopback: false })).toMatch(
      /TLS/,
    );
  });

  it('does not mistake a remote hostname beginning with 127 for a loopback address', () => {
    expect(
      databaseUrlSecurityIssue('postgresql://admin:secret@127.attacker.example:5432/postgres', {
        allowUnencryptedLoopback: true,
      }),
    ).toMatch(/TLS/);
  });

  it('allows an exact explicitly trusted test-container hostname', () => {
    expect(
      databaseUrlSecurityIssue('postgresql://rephone:rephone@postgres-test:5432/rephone_test', {
        allowUnencryptedLoopback: true,
        allowUnencryptedHostnames: ['postgres-test'],
      }),
    ).toBeUndefined();
  });

  it('rejects a non-PostgreSQL URL even if it carries an sslmode parameter', () => {
    expect(
      databaseUrlSecurityIssue('https://database.example.com/?sslmode=require', {
        allowUnencryptedLoopback: false,
      }),
    ).toMatch(/postgresql/);
  });
});
