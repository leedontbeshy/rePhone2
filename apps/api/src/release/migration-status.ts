export interface DatabaseMigrationRecord {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface ReleaseMigrationStatus {
  ready: boolean;
  pending: string[];
  incomplete: string[];
  unknownApplied: string[];
}

export function evaluateReleaseMigrationStatus(
  localMigrationNames: readonly string[],
  databaseMigrations: readonly DatabaseMigrationRecord[],
): ReleaseMigrationStatus {
  const local = new Set(localMigrationNames);
  const applied = new Set(
    databaseMigrations
      .filter(({ finishedAt, rolledBackAt }) => finishedAt !== null && rolledBackAt === null)
      .map(({ migrationName }) => migrationName),
  );
  const incomplete = databaseMigrations
    .filter(({ finishedAt, rolledBackAt }) => finishedAt === null && rolledBackAt === null)
    .map(({ migrationName }) => migrationName)
    .sort();
  const pending = [...local].filter((migrationName) => !applied.has(migrationName)).sort();
  const unknownApplied = [...applied].filter((migrationName) => !local.has(migrationName)).sort();

  return {
    ready: pending.length === 0 && incomplete.length === 0 && unknownApplied.length === 0,
    pending,
    incomplete,
    unknownApplied,
  };
}
