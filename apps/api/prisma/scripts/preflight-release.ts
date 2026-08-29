import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrlSecurityIssue } from '../../src/config/database-url-security.js';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  evaluateReleaseMigrationStatus,
  type DatabaseMigrationRecord,
  type LocalMigrationRecord,
} from '../../src/release/migration-status.js';

async function runReleasePreflight(): Promise<void> {
  loadWorkspaceEnvironment();
  const connectionString = requiredEnvironment('DATABASE_URL');
  const securityIssue = databaseUrlSecurityIssue(connectionString, {
    allowUnencryptedLoopback: true,
    allowUnencryptedHostnames: process.env.NODE_ENV === 'test' ? ['postgres-test'] : [],
    requireCertificateVerification: process.env.NODE_ENV === 'production',
  });
  if (securityIssue !== undefined) {
    throw new Error(`DATABASE_URL ${securityIssue}; release preflight did not connect`);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const localMigrations = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<LocalMigrationRecord> => {
          const sql = await readFile(join(migrationsDirectory, entry.name, 'migration.sql'));
          return {
            migrationName: entry.name,
            checksum: createHash('sha256').update(sql).digest('hex'),
          };
        }),
    );
    localMigrations.sort((left, right) => left.migrationName.localeCompare(right.migrationName));
    const deployed = await prisma.$queryRaw<DatabaseMigrationRecord[]>`
      SELECT
        migration_name AS "migrationName",
        checksum,
        finished_at AS "finishedAt",
        rolled_back_at AS "rolledBackAt"
      FROM "_prisma_migrations"
      ORDER BY started_at ASC, id ASC
    `;
    const status = evaluateReleaseMigrationStatus(localMigrations, deployed);

    process.stdout.write(`${JSON.stringify({ migrations: status }, null, 2)}\n`);
    if (!status.ready) {
      throw new Error('Release preflight found migration drift, pending or incomplete migration');
    }
  } finally {
    await prisma.$disconnect();
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the release preflight`);
  }
  return value;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
  await runReleasePreflight();
}
