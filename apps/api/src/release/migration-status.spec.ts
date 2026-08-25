import { describe, expect, it } from 'vitest';
import { evaluateReleaseMigrationStatus } from './migration-status.js';

describe('evaluateReleaseMigrationStatus', () => {
  it('accepts an exact set of successfully deployed migrations', () => {
    expect(
      evaluateReleaseMigrationStatus(
        ['001_baseline', '002_slice12'],
        [
          {
            migrationName: '001_baseline',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
          {
            migrationName: '002_slice12',
            finishedAt: new Date('2026-01-02T00:00:00.000Z'),
            rolledBackAt: null,
          },
        ],
      ),
    ).toEqual({ ready: true, pending: [], incomplete: [], unknownApplied: [] });
  });

  it('reports pending, incomplete and database-only migrations deterministically', () => {
    expect(
      evaluateReleaseMigrationStatus(
        ['001_baseline', '003_pending'],
        [
          {
            migrationName: '001_baseline',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            rolledBackAt: null,
          },
          { migrationName: '002_failed', finishedAt: null, rolledBackAt: null },
          {
            migrationName: '000_database_only',
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
    });
  });

  it('treats a rolled-back migration as pending instead of incomplete', () => {
    expect(
      evaluateReleaseMigrationStatus(
        ['001_retry'],
        [
          {
            migrationName: '001_retry',
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
    });
  });
});
