import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Client } from 'pg';
import { IDENTIFIER_FIELDS } from './demo-rotation.js';

const MAGIC = Buffer.from('REPHONE-DEMO-BACKUP-1\n');
export function encryptBackup(bytes: Uint8Array, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  return Buffer.concat([MAGIC, nonce, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}
export function decryptBackup(bytes: Buffer, key: Buffer): Buffer {
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid encrypted backup.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(MAGIC.length, MAGIC.length + 12),
  );
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(MAGIC.length + 12, -16)), decipher.final()]);
}
export const sha256 = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
export async function privateWrite(
  path: string,
  data: string | Uint8Array,
  exclusive = true,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, data, { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
}
export async function saveEncrypted(path: string, data: Uint8Array, key: Buffer): Promise<void> {
  await privateWrite(path, encryptBackup(data, key));
}
export async function loadEncrypted(path: string, key: Buffer): Promise<Buffer> {
  return decryptBackup(await readFile(path), key);
}
export const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;
export async function applicationTables(client: Client): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  return result.rows.map((row) => row.tablename);
}
export interface TableFingerprint {
  count: number;
  digest: string;
}
export type Snapshot = Record<string, TableFingerprint>;
const mutableColumns: Record<string, string[]> = {
  inventory_units: [
    ...IDENTIFIER_FIELDS.flatMap((field) => [field.encrypted, field.hmac]),
    'identifier_key_version',
  ],
  users: ['password_hash', 'password_changed_at'],
  auth_sessions: ['revoked_at'],
  auth_tokens: ['consumed_at'],
};
export async function snapshot(client: Client, full = false): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const table of await applicationTables(client)) {
    const excluded = full ? [] : (mutableColumns[table] ?? []);
    const rows = await client.query<{ row: unknown }>(
      `SELECT to_jsonb(t) - $1::text[] AS row FROM public.${quoteIdentifier(table)} t ORDER BY (to_jsonb(t) - $1::text[])::text`,
      [excluded],
    );
    result[table] = { count: rows.rowCount ?? 0, digest: sha256(JSON.stringify(rows.rows)) };
  }
  return result;
}
export function assertSnapshot(expected: Snapshot, actual: Snapshot): void {
  const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter(
    (name) => JSON.stringify(expected[name]) !== JSON.stringify(actual[name]),
  );
  if (changed.length)
    throw new Error(
      `Database changed outside the allowed credential/identifier fields (${changed.join(', ')}); stopped.`,
    );
}
