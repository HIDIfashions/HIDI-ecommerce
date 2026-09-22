CREATE TABLE "PurchaseOrderVariant" (
  "id" TEXT NOT NULL,
  "purchaseOrderLineId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "orderedQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrderVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderVariant_purchaseOrderLineId_variantId_key"
  ON "PurchaseOrderVariant"("purchaseOrderLineId", "variantId");
CREATE INDEX "PurchaseOrderVariant_variantId_idx"
  ON "PurchaseOrderVariant"("variantId");

ALTER TABLE "PurchaseOrderVariant"
  ADD CONSTRAINT "PurchaseOrderVariant_purchaseOrderLineId_fkey"
  FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderVariant"
  ADD CONSTRAINT "PurchaseOrderVariant_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderVariant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseOrderVariant" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrderVariant" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrderVariant" FROM authenticated';
  END IF;
END $$;
