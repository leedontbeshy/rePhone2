import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { databaseTargetIssue } from '../../src/config/database-target.js';

// An isolated database is created for this run; no existing schema is reset.
const base = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://rephone:rephone@127.0.0.1:5434/rephone_test',
);
assert.equal(
  databaseTargetIssue(base.toString(), 'test'),
  undefined,
  'Upgrade requires a local test database',
);
assert(base.pathname.endsWith('_test'), 'Upgrade harness requires TEST_DATABASE_URL ending _test');
const database = `rephone_dealer_upgrade_${randomUUID().replaceAll('-', '')}_test`;
assert(/^[a-z0-9_]+_test$/.test(database));
const control = new Client({ connectionString: base.toString() });
await control.connect();
const target = new URL(base);
target.pathname = `/${database}`;
const client = new Client({ connectionString: target.toString() });
let connected = false;
let created = false;
try {
  await control.query(`CREATE DATABASE "${database}"`);
  created = true;
  await client.connect();
  connected = true;
  await client.query(
    `CREATE TABLE _prisma_migrations (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)`,
  );
  const directory = new URL('../../prisma/migrations/', import.meta.url);
  const migrations = (await readdir(directory, { withFileTypes: true }))
    .filter((row) => row.isDirectory())
    .map((row) => row.name)
    .sort();
  const baseline = migrations.filter((name) => name < '20261009090000');
  const dealer = migrations.filter((name) => name >= '20261009090000');
  for (const name of baseline)
    await client.query(await readFile(new URL(`${name}/migration.sql`, directory), 'utf8'));
  const cart = randomUUID();
  const location = randomUUID();
  const order = randomUUID();
  const payment = randomUUID();
  await client.query(
    `INSERT INTO inventory_locations(id,code,name,type,status,updated_at) VALUES($1,'UPGRADE','Upgrade fixture','STORE','ACTIVE',now())`,
    [location],
  );
  await client.query(
    `INSERT INTO carts(id,guest_token_hash,status,expires_at,updated_at) VALUES($1,$2,'CONVERTED',now()+interval '1 day',now())`,
    [cart, 'a'.repeat(64)],
  );
  await client.query(
    `INSERT INTO orders(id,order_number,source_cart_id,guest_access_token_hash,customer_name,customer_email,customer_phone,fulfillment_type,fulfillment_location_id,shipping_address_snapshot,subtotal,grand_total,deposit_required,paid_amount,balance_due,payment_status,updated_at) VALUES($1,'RPH-UPGRADE',$2,$3,'Upgrade customer','upgrade@example.test','0900000000','SHIPPING',$4,'{}',10000000,10000000,500000,1000000,9000000,'PARTIALLY_PAID',now())`,
    [order, cart, 'b'.repeat(64), location],
  );
  await client.query(
    `INSERT INTO payments(id,order_id,purpose,method,expected_amount,received_amount,status,reviewed_at,updated_at) VALUES($1,$2,'BALANCE','BANK_TRANSFER',1000000,1000000,'VERIFIED',now(),now())`,
    [payment, order],
  );
  const beforeOrder = (
    await client.query<Record<string, unknown>>('SELECT * FROM orders WHERE id=$1', [order])
  ).rows[0];
  const beforePayment = (
    await client.query<Record<string, unknown>>('SELECT * FROM payments WHERE id=$1', [payment])
  ).rows[0];
  assert(beforeOrder !== undefined && beforePayment !== undefined);
  for (const name of dealer)
    await client.query(await readFile(new URL(`${name}/migration.sql`, directory), 'utf8'));
  const afterOrder = (
    await client.query<Record<string, unknown>>('SELECT * FROM orders WHERE id=$1', [order])
  ).rows[0];
  assert(afterOrder !== undefined);
  for (const key of Object.keys(beforeOrder))
    assert.deepEqual(afterOrder[key], beforeOrder[key], `Retail order changed: ${key}`);
  assert.equal(afterOrder['channel'], 'STOREFRONT');
  assert.equal(afterOrder['dealer_id'], null);
  assert.deepEqual(
    (await client.query('SELECT * FROM payments WHERE id=$1', [payment])).rows[0],
    beforePayment,
  );
  assert.equal(
    (await client.query<{ count: string }>('SELECT count(*)::text FROM dealer_bank_transactions'))
      .rows[0]?.count,
    '0',
    'Never derive verified dealer cash from legacy payments',
  );
  await assert.rejects(
    client.query('UPDATE orders SET source_cart_id=NULL WHERE id=$1', [order]),
    /orders_identity_check/,
  );
  await client.query('UPDATE orders SET internal_note=$1,updated_at=now() WHERE id=$2', [
    'Retail updates still work',
    order,
  ]);
  process.stdout.write(
    `PASS: ${baseline.length.toString()} baseline migrations + ${dealer.length.toString()} dealer migrations; existing retail identity, paid balance and Payment preserved; dealer ledger empty; constraints enforced.\n`,
  );
} finally {
  if (connected) await client.end();
  if (created) await control.query(`DROP DATABASE "${database}"`);
  await control.end();
}
