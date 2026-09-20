CREATE TABLE "OrderAuditEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "amountPaise" INTEGER,
  "eventKey" TEXT,
  "correlationId" TEXT,
  "source" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAuditEvent_eventKey_key"
  ON "OrderAuditEvent"("eventKey");

CREATE INDEX "OrderAuditEvent_orderId_createdAt_id_idx"
  ON "OrderAuditEvent"("orderId", "createdAt", "id");

CREATE INDEX "OrderAuditEvent_eventType_createdAt_idx"
  ON "OrderAuditEvent"("eventType", "createdAt");

CREATE INDEX "OrderAuditEvent_correlationId_idx"
  ON "OrderAuditEvent"("correlationId");

ALTER TABLE "OrderAuditEvent"
  ADD CONSTRAINT "OrderAuditEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderAuditEvent"
  ADD CONSTRAINT "OrderAuditEvent_amount_nonnegative"
  CHECK ("amountPaise" IS NULL OR "amountPaise" >= 0);

-- Existing orders predate the append-only audit stream. Preserve two explicit
-- baselines without pretending we know intermediate historical transitions.
INSERT INTO "OrderAuditEvent" (
  "id", "orderId", "eventType", "actorType", "entityType", "entityId",
  "toStatus", "eventKey", "source", "metadata", "createdAt"
)
SELECT
  'audit_created_' || md5(o."id"),
  o."id",
  'ORDER_CREATED',
  'SYSTEM',
  'ORDER',
  o."id",
  'PENDING_PAYMENT',
  'audit:order-created:' || o."id",
  'MIGRATION_BACKFILL',
  jsonb_build_object('backfilled', true),
  o."createdAt"
FROM "Order" o
ON CONFLICT ("eventKey") DO NOTHING;

INSERT INTO "OrderAuditEvent" (
  "id", "orderId", "eventType", "actorType", "entityType", "entityId",
  "toStatus", "eventKey", "source", "metadata", "createdAt"
)
SELECT
  'audit_state_' || md5(o."id"),
  o."id",
  'CURRENT_STATE_BASELINE',
  'SYSTEM',
  'ORDER',
  o."id",
  o."status"::text,
  'audit:state-baseline:' || o."id",
  'MIGRATION_BACKFILL',
  jsonb_build_object('backfilled', true, 'note', 'Current state when audit timeline was introduced'),
  o."updatedAt"
FROM "Order" o
WHERE o."status"::text <> 'PENDING_PAYMENT'
ON CONFLICT ("eventKey") DO NOTHING;

ALTER TABLE "OrderAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "OrderAuditEvent" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "OrderAuditEvent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "OrderAuditEvent" FROM authenticated;
  END IF;
END $$;
