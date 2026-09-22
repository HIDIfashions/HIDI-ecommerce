ALTER TABLE "Product" ADD COLUMN "internalName" TEXT;
UPDATE "Product" SET "internalName" = "name" WHERE "internalName" IS NULL;

CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'OPEN',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED'
);

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "orderDate" TIMESTAMP(3) NOT NULL,
  "expectedAt" TIMESTAMP(3),
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX "PurchaseOrder_vendorId_orderDate_idx" ON "PurchaseOrder"("vendorId", "orderDate");
CREATE INDEX "PurchaseOrder_status_orderDate_idx" ON "PurchaseOrder"("status", "orderDate");

CREATE TABLE "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "vendorProductId" TEXT,
  "productId" TEXT NOT NULL,
  "vendorStyleCode" TEXT NOT NULL,
  "description" TEXT,
  "orderedQuantity" INTEGER NOT NULL,
  "unitCostPaise" INTEGER,
  "hsn" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_lineNumber_key"
  ON "PurchaseOrderLine"("purchaseOrderId", "lineNumber");
CREATE INDEX "PurchaseOrderLine_vendorProductId_idx" ON "PurchaseOrderLine"("vendorProductId");
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");

ALTER TABLE "StockReceipt"
  ADD COLUMN "purchaseOrderId" TEXT;

ALTER TABLE "StockReceiptLine"
  ADD COLUMN "purchaseOrderLineId" TEXT;

ALTER TABLE "VendorInvoice"
  ADD COLUMN "purchaseOrderId" TEXT;

ALTER TABLE "VendorInvoiceLine"
  ADD COLUMN "purchaseOrderLineId" TEXT;

CREATE INDEX "StockReceipt_purchaseOrderId_receivedAt_idx"
  ON "StockReceipt"("purchaseOrderId", "receivedAt");
CREATE INDEX "StockReceiptLine_purchaseOrderLineId_idx"
  ON "StockReceiptLine"("purchaseOrderLineId");
CREATE INDEX "VendorInvoice_purchaseOrderId_invoiceDate_idx"
  ON "VendorInvoice"("purchaseOrderId", "invoiceDate");
CREATE INDEX "VendorInvoiceLine_purchaseOrderLineId_idx"
  ON "VendorInvoiceLine"("purchaseOrderLineId");

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_vendorProductId_fkey"
  FOREIGN KEY ("vendorProductId") REFERENCES "VendorProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReceipt"
  ADD CONSTRAINT "StockReceipt_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReceiptLine"
  ADD CONSTRAINT "StockReceiptLine_purchaseOrderLineId_fkey"
  FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorInvoice"
  ADD CONSTRAINT "VendorInvoice_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorInvoiceLine"
  ADD CONSTRAINT "VendorInvoiceLine_purchaseOrderLineId_fkey"
  FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrderLine" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseOrder" FROM PUBLIC;
REVOKE ALL ON TABLE "PurchaseOrderLine" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrder" FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrderLine" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrder" FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE "PurchaseOrderLine" FROM authenticated';
  END IF;
END $$;
