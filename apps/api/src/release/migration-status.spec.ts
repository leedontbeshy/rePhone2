import { describe, expect, it } from 'vitest';
import { evaluateReleaseMigrationStatus } from './migration-status.js';

describe('evaluateReleaseMigrationStatus', () => {
  it('accepts an exact set of successfully deployed migrations', () => {
    expect(
      evaluateReleaseMigrationStatus(
        [localMigration('001_baseline', 'aaa'), localMigration('002_slice12', 'bbb')],
        [
          {
            migrationName: '001_baseline',
            checksum: 'aaa',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
          {
            migrationName: '002_slice12',
            checksum: 'bbb',
            finishedAt: new Date('2026-01-02T00:00:00.000Z'),
            rolledBackAt: null,
          },
        ],
      ),
    ).toEqual({
      ready: true,
      pending: [],
      incomplete: [],
      unknownApplied: [],
      checksumMismatch: [],
    });
  });

  it('reports pending, incomplete and database-only migrations deterministically', () => {
    expect(
      evaluateReleaseMigrationStatus(
        [localMigration('001_baseline', 'aaa'), localMigration('003_pending', 'ccc')],
        [
          {
            migrationName: '001_baseline',
            checksum: 'aaa',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
          {
            migrationName: '002_failed',
            checksum: 'bbb',
            finishedAt: null,
            rolledBackAt: null,
          },
          {
            migrationName: '000_database_only',
            checksum: '000',
            finishedAt: new Date('2025-12-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
        ],
      ),
    ).toEqual({
      ready: false,
      pending: ['003_pending'],
      incomplete: ['002_failed'],
      unknownApplied: ['000_database_only'],
      checksumMismatch: [],
    });
  });

  it('treats a rolled-back migration as pending instead of incomplete', () => {
    expect(
      evaluateReleaseMigrationStatus(
        [localMigration('001_retry', 'aaa')],
        [
          {
            migrationName: '001_retry',
            checksum: 'aaa',
            finishedAt: null,
            rolledBackAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      ),
    ).toEqual({
      ready: false,
      pending: ['001_retry'],
      incomplete: [],
      unknownApplied: [],
      checksumMismatch: [],
    });
  });

  it('rejects a deployed migration whose SQL checksum changed', () => {
    expect(
      evaluateReleaseMigrationStatus(
        [localMigration('001_baseline', 'expected')],
        [
          {
            migrationName: '001_baseline',
            checksum: 'deployed',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
        ],
      ),
    ).toEqual({
      ready: false,
      pending: [],
      incomplete: [],
      unknownApplied: [],
      checksumMismatch: ['001_baseline'],
    });
  });
});

function localMigration(migrationName: string, checksum: string) {
  return { migrationName, checksum };
}
