CREATE TABLE "AdminMediaUploadTicket" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "maxBytes" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminMediaUploadTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminMediaUploadTicket_tokenHash_key"
  ON "AdminMediaUploadTicket"("tokenHash");

CREATE INDEX "AdminMediaUploadTicket_variantId_expiresAt_idx"
  ON "AdminMediaUploadTicket"("variantId", "expiresAt");

CREATE INDEX "AdminMediaUploadTicket_expiresAt_usedAt_idx"
  ON "AdminMediaUploadTicket"("expiresAt", "usedAt");

ALTER TABLE "AdminMediaUploadTicket"
  ADD CONSTRAINT "AdminMediaUploadTicket_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminMediaUploadTicket"
  ADD CONSTRAINT "AdminMediaUploadTicket_policy_check"
  CHECK (
    "maxBytes" > 0
    AND "maxBytes" <= 8388608
    AND "mimeType" IN ('image/jpeg','image/png','image/webp','image/avif')
  );

ALTER TABLE "AdminMediaUploadTicket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminMediaUploadTicket" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "AdminMediaUploadTicket" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "AdminMediaUploadTicket" FROM authenticated;
  END IF;
END $$;
