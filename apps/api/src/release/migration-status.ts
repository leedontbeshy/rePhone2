export interface LocalMigrationRecord {
  migrationName: string;
  checksum: string;
}

export interface DatabaseMigrationRecord {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface ReleaseMigrationStatus {
  ready: boolean;
  pending: string[];
  incomplete: string[];
  unknownApplied: string[];
  checksumMismatch: string[];
}

export function evaluateReleaseMigrationStatus(
  localMigrations: readonly LocalMigrationRecord[],
  databaseMigrations: readonly DatabaseMigrationRecord[],
): ReleaseMigrationStatus {
  const local = new Map(
    localMigrations.map(({ migrationName, checksum }) => [migrationName, checksum] as const),
  );
  const appliedMigrations = databaseMigrations.filter(
    ({ finishedAt, rolledBackAt }) => finishedAt !== null && rolledBackAt === null,
  );
  const applied = new Map(
    appliedMigrations.map(({ migrationName, checksum }) => [migrationName, checksum] as const),
  );
  const incomplete = databaseMigrations
    .filter(({ finishedAt, rolledBackAt }) => finishedAt === null && rolledBackAt === null)
    .map(({ migrationName }) => migrationName)
    .sort();
  const pending = [...local.keys()].filter((migrationName) => !applied.has(migrationName)).sort();
  const unknownApplied = [...applied.keys()]
    .filter((migrationName) => !local.has(migrationName))
    .sort();
  const checksumMismatch = appliedMigrations
    .filter(({ migrationName, checksum }) => {
      const localChecksum = local.get(migrationName);
      return localChecksum !== undefined && localChecksum !== checksum;
    })
    .map(({ migrationName }) => migrationName)
    .sort();

  return {
    ready:
      pending.length === 0 &&
      incomplete.length === 0 &&
      unknownApplied.length === 0 &&
      checksumMismatch.length === 0,
    pending,
    incomplete,
    unknownApplied,
    checksumMismatch,
  };
}
