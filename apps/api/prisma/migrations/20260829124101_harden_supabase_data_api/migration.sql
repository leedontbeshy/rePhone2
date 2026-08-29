-- rePhone accesses business data through NestJS/Prisma, not Supabase Data API.
-- Keep the runtime role separate from the login role so credentials never enter
-- migration history and can be rotated independently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rephone_app') THEN
    CREATE ROLE rephone_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE rephone_app WITH
  NOLOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  CONNECTION LIMIT -1;

-- A pre-existing group role must not inherit privileges from another role, and
-- no Data API role may already inherit application DML through it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    JOIN pg_roles AS member ON member.oid = membership.member
    JOIN pg_roles AS parent ON parent.oid = membership.roleid
    WHERE member.rolname = 'rephone_app'
  ) THEN
    RAISE EXCEPTION 'rephone_app has an unexpected parent role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    JOIN pg_roles AS member ON member.oid = membership.member
    JOIN pg_roles AS parent ON parent.oid = membership.roleid
    WHERE parent.rolname = 'rephone_app'
      AND member.rolname <> 'rephone_runtime'
  ) THEN
    RAISE EXCEPTION 'rephone_app has an unexpected member role';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rephone_runtime') THEN
    GRANT rephone_app TO rephone_runtime
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM rephone_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rephone_app;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM rephone_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM rephone_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM rephone_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rephone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rephone_app;

-- Readiness may inspect migration state, but compromised runtime credentials
-- must not be able to falsify it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE "_prisma_migrations" FROM rephone_app;
GRANT SELECT ON TABLE "_prisma_migrations" TO rephone_app;

-- Prisma migrations are owned by postgres on Supabase. Future application
-- tables inherit only the DML privileges needed by the runtime role.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'REVOKE ALL PRIVILEGES ON TABLES FROM rephone_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'REVOKE ALL PRIVILEGES ON SEQUENCES FROM rephone_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
    'REVOKE ALL PRIVILEGES ON FUNCTIONS FROM rephone_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rephone_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT USAGE, SELECT ON SEQUENCES TO rephone_app',
    current_user
  );
END
$$;

-- Existing Supabase projects historically granted Data API roles broad access
-- to every object in public. Revoke current grants without assuming those roles
-- exist in the isolated PostgreSQL test container.
DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless told otherwise.
-- The two application trigger functions do not need direct caller access.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
        current_user,
        target_role
      );
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
    'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    current_user
  );
END
$$;
