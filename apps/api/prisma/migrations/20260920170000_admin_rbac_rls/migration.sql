CREATE TABLE "AdminStaff" (
  "id" TEXT NOT NULL,
  "authSubject" TEXT,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminStaff_authSubject_key" ON "AdminStaff"("authSubject");
CREATE UNIQUE INDEX "AdminStaff_email_key" ON "AdminStaff"("email");
CREATE INDEX "AdminStaff_role_active_idx" ON "AdminStaff"("role", "active");

ALTER TABLE "AdminStaff"
  ADD CONSTRAINT "AdminStaff_role_check"
  CHECK ("role" IN ('OWNER','OPERATIONS','SUPPORT','CATALOG'));

ALTER TABLE "AdminStaff"
  ADD CONSTRAINT "AdminStaff_identity_check"
  CHECK (
    length(trim("email")) > 3
    AND length(trim("displayName")) BETWEEN 2 AND 120
  );

-- HIDI uses Supabase Auth only for identity. Business data is accessed through
-- the NestJS API over the server-side Postgres connection, never directly from
-- the browser through PostgREST. Lock every current public table accordingly.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', tbl);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', tbl);
    END IF;
  END LOOP;
END $$;

-- Future Prisma tables should not inherit broad PostgREST privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
