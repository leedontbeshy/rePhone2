import { Client } from 'pg';
import { databaseUrlSecurityIssue } from '../../src/config/database-url-security.js';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';

const RUNTIME_ROLE = 'rephone_runtime';
const PRIVILEGE_ROLE = 'rephone_app';

loadWorkspaceEnvironment();

const directUrl = requiredEnvironment('DIRECT_URL');
const runtimeUrl = requiredEnvironment('DATABASE_URL');
const password = requiredEnvironment('REPHONE_RUNTIME_DB_PASSWORD');
if (password.length < 24) {
  throw new Error('REPHONE_RUNTIME_DB_PASSWORD must contain at least 24 characters');
}

assertSecureProvisioningUrl('DIRECT_URL', directUrl);
assertSecureProvisioningUrl('DATABASE_URL', runtimeUrl);

const client = new Client({ connectionString: directUrl });
await client.connect();

try {
  await client.query('BEGIN');

  const privilegeRole = await client.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS "exists"',
    [PRIVILEGE_ROLE],
  );
  if (privilegeRole.rows[0]?.exists !== true) {
    throw new Error(`${PRIVILEGE_ROLE} is missing; deploy database migrations first`);
  }

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
        CREATE ROLE ${RUNTIME_ROLE}
          LOGIN
          INHERIT
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOREPLICATION
          NOBYPASSRLS
          CONNECTION LIMIT 20;
      END IF;
    END
    $$
  `);

  await client.query("SELECT set_config('rephone.runtime_password', $1, true)", [password]);
  await client.query(`
    DO $$
    DECLARE
      runtime_password text := current_setting('rephone.runtime_password', true);
    BEGIN
      IF runtime_password IS NULL OR LENGTH(runtime_password) < 24 THEN
        RAISE EXCEPTION 'Runtime role password is unavailable';
      END IF;
      EXECUTE format(
        'ALTER ROLE ${RUNTIME_ROLE} WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB '
        'NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD %L',
        runtime_password
      );
    END
    $$
  `);
  await client.query(`
    GRANT ${PRIVILEGE_ROLE} TO ${RUNTIME_ROLE}
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE
  `);

  const verification = await client.query<{
    canLogin: boolean;
    isSuperuser: boolean;
    inheritsRoles: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    canReplicate: boolean;
    bypassRls: boolean;
    connectionLimit: number;
  }>(`
    SELECT
      rolcanlogin AS "canLogin",
      rolsuper AS "isSuperuser",
      rolinherit AS "inheritsRoles",
      rolcreatedb AS "canCreateDatabase",
      rolcreaterole AS "canCreateRole",
      rolreplication AS "canReplicate",
      rolbypassrls AS "bypassRls",
      rolconnlimit AS "connectionLimit"
    FROM pg_roles
    WHERE rolname = '${RUNTIME_ROLE}'
  `);
  const role = verification.rows[0];
  if (
    role?.canLogin !== true ||
    role.isSuperuser ||
    !role.inheritsRoles ||
    role.canCreateDatabase ||
    role.canCreateRole ||
    role.canReplicate ||
    role.bypassRls ||
    role.connectionLimit !== 20
  ) {
    throw new Error('Runtime role verification failed');
  }

  const memberships = await client.query<{
    parentRole: string;
    adminOption: boolean;
    inheritOption: boolean;
    setOption: boolean;
  }>(`
    SELECT
      parent.rolname AS "parentRole",
      membership.admin_option AS "adminOption",
      membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption"
    FROM pg_auth_members AS membership
    JOIN pg_roles AS member ON member.oid = membership.member
    JOIN pg_roles AS parent ON parent.oid = membership.roleid
    WHERE member.rolname = '${RUNTIME_ROLE}'
    ORDER BY parent.rolname
  `);
  if (
    memberships.rows.length !== 1 ||
    memberships.rows[0]?.parentRole !== PRIVILEGE_ROLE ||
    memberships.rows[0].adminOption ||
    !memberships.rows[0].inheritOption ||
    memberships.rows[0].setOption
  ) {
    throw new Error('Runtime role has an unexpected inherited role membership');
  }

  const privilegeRoleState = await client.query<{
    canLogin: boolean;
    isSuperuser: boolean;
    inheritsRoles: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    canReplicate: boolean;
    bypassRls: boolean;
    parentCount: number;
    unexpectedMemberCount: number;
  }>(`
    SELECT
      role.rolcanlogin AS "canLogin",
      role.rolsuper AS "isSuperuser",
      role.rolinherit AS "inheritsRoles",
      role.rolcreatedb AS "canCreateDatabase",
      role.rolcreaterole AS "canCreateRole",
      role.rolreplication AS "canReplicate",
      role.rolbypassrls AS "bypassRls",
      (
        SELECT COUNT(*)::integer
        FROM pg_auth_members AS membership
        WHERE membership.member = role.oid
      ) AS "parentCount",
      (
        SELECT COUNT(*)::integer
        FROM pg_auth_members AS membership
        JOIN pg_roles AS member ON member.oid = membership.member
        WHERE membership.roleid = role.oid
          AND member.rolname <> '${RUNTIME_ROLE}'
      ) AS "unexpectedMemberCount"
    FROM pg_roles AS role
    WHERE role.rolname = '${PRIVILEGE_ROLE}'
  `);
  const privilegeRoleVerification = privilegeRoleState.rows[0];
  if (
    privilegeRoleVerification === undefined ||
    privilegeRoleVerification.canLogin ||
    privilegeRoleVerification.isSuperuser ||
    privilegeRoleVerification.inheritsRoles ||
    privilegeRoleVerification.canCreateDatabase ||
    privilegeRoleVerification.canCreateRole ||
    privilegeRoleVerification.canReplicate ||
    privilegeRoleVerification.bypassRls ||
    privilegeRoleVerification.parentCount !== 0 ||
    privilegeRoleVerification.unexpectedMemberCount !== 0
  ) {
    throw new Error('Application privilege role has unsafe attributes or memberships');
  }

  await client.query(`
    CREATE FUNCTION public.__rephone_default_privilege_probe()
    RETURNS integer
    LANGUAGE sql
    AS 'SELECT 1'
  `);
  const executableProbeRoles = await client.query<{ roleName: string }>(`
    SELECT candidate.rolname AS "roleName"
    FROM pg_roles AS candidate
    WHERE candidate.rolname IN (
      '${RUNTIME_ROLE}',
      'anon',
      'authenticated',
      'service_role'
    )
      AND has_function_privilege(
        candidate.oid,
        'public.__rephone_default_privilege_probe()'::regprocedure,
        'EXECUTE'
      )
  `);
  if (executableProbeRoles.rows.length > 0) {
    throw new Error('New public functions still inherit an unsafe EXECUTE privilege');
  }
  await client.query('DROP FUNCTION public.__rephone_default_privilege_probe()');

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

await verifyRuntimeConnection(runtimeUrl);
process.stdout.write(
  `${JSON.stringify({ role: RUNTIME_ROLE, provisioned: true, verified: true })}\n`,
);

async function verifyRuntimeConnection(connectionString: string): Promise<void> {
  const runtimeClient = new Client({ connectionString });
  await runtimeClient.connect();

  try {
    const roleResult = await runtimeClient.query<{
      currentUser: string;
      canCreateInPublic: boolean;
      canReadMigrations: boolean;
      canMutateMigrations: boolean;
    }>(`
      SELECT
        current_user AS "currentUser",
        has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInPublic",
        has_table_privilege(current_user, 'public._prisma_migrations', 'SELECT')
          AS "canReadMigrations",
        (
          has_table_privilege(current_user, 'public._prisma_migrations', 'INSERT') OR
          has_table_privilege(current_user, 'public._prisma_migrations', 'UPDATE') OR
          has_table_privilege(current_user, 'public._prisma_migrations', 'DELETE') OR
          has_table_privilege(current_user, 'public._prisma_migrations', 'TRUNCATE') OR
          has_table_privilege(current_user, 'public._prisma_migrations', 'REFERENCES') OR
          has_table_privilege(current_user, 'public._prisma_migrations', 'TRIGGER')
        ) AS "canMutateMigrations"
    `);
    const role = roleResult.rows[0];
    if (
      role?.currentUser !== RUNTIME_ROLE ||
      role.canCreateInPublic ||
      !role.canReadMigrations ||
      role.canMutateMigrations
    ) {
      throw new Error('Runtime connection identity or migration-table permissions are invalid');
    }

    const tableResult = await runtimeClient.query<{
      tableCount: number;
      allBusinessDml: boolean;
    }>(`
      SELECT
        COUNT(*)::integer AS "tableCount",
        COALESCE(
          BOOL_AND(
            has_table_privilege(current_user, FORMAT('%I.%I', schemaname, tablename), 'SELECT') AND
            has_table_privilege(current_user, FORMAT('%I.%I', schemaname, tablename), 'INSERT') AND
            has_table_privilege(current_user, FORMAT('%I.%I', schemaname, tablename), 'UPDATE') AND
            has_table_privilege(current_user, FORMAT('%I.%I', schemaname, tablename), 'DELETE')
          ),
          false
        ) AS "allBusinessDml"
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
    `);
    const tables = tableResult.rows[0];
    if (tables === undefined || tables.tableCount === 0 || !tables.allBusinessDml) {
      throw new Error('Runtime role is missing business-table DML permissions');
    }

    // Exercise both sides of the boundary with no-op statements. Permission
    // checks still run even though the predicates cannot modify application data.
    await runtimeClient.query('SELECT id FROM public.products LIMIT 0');
    await runtimeClient.query(
      'INSERT INTO public.products SELECT * FROM public.products WHERE false',
    );
    await runtimeClient.query('UPDATE public.products SET id = id WHERE false');
    await runtimeClient.query('DELETE FROM public.products WHERE false');
    await expectPermissionDenied(
      runtimeClient,
      'INSERT INTO public."_prisma_migrations" SELECT * FROM public."_prisma_migrations" WHERE false',
    );
    await expectPermissionDenied(
      runtimeClient,
      'UPDATE public."_prisma_migrations" SET logs = logs WHERE false',
    );
    await expectPermissionDenied(
      runtimeClient,
      'DELETE FROM public."_prisma_migrations" WHERE false',
    );
    await expectPermissionDenied(runtimeClient, 'TRUNCATE public."_prisma_migrations"');
    await expectPermissionDenied(
      runtimeClient,
      'CREATE TABLE public.__rephone_runtime_privilege_probe (id integer)',
    );
  } finally {
    await runtimeClient.end();
  }
}

async function expectPermissionDenied(client: Client, statement: string): Promise<void> {
  await client.query('BEGIN');
  let permissionDenied = false;
  try {
    await client.query(statement);
  } catch (error) {
    if (isPostgresError(error) && error.code === '42501') {
      permissionDenied = true;
    } else {
      throw error;
    }
  } finally {
    await client.query('ROLLBACK');
  }

  if (!permissionDenied) {
    throw new Error('Runtime role unexpectedly crossed a protected database boundary');
  }
}

function isPostgresError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  );
}

function assertSecureProvisioningUrl(name: string, connectionString: string): void {
  const issue = databaseUrlSecurityIssue(connectionString, {
    allowUnencryptedLoopback: true,
  });
  if (issue !== undefined) {
    throw new Error(`${name} ${issue}; remote provisioning is blocked before credentials are sent`);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
