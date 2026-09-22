-- Procurement, repeat-order product mapping, lot traceability, and customer invoice lineage

CREATE TYPE "VendorInvoiceStatus" AS ENUM (
  'UPLOADED',
  'MAPPING',
  'AWAITING_STOCK',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'RECONCILED',
  'CANCELLED'
);

CREATE TYPE "InvoiceBreakupSource" AS ENUM (
  'EXPLICIT_INVOICE',
  'PACK_PATTERN',
  'MANUAL'
);

CREATE TYPE "CustomerInvoiceStatus" AS ENUM (
  'ISSUED',
  'VOIDED',
  'CREDITED'
);

CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gstin" TEXT,
  "city" TEXT,
  "state" TEXT,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");
CREATE INDEX "Vendor_active_name_idx" ON "Vendor"("active", "name");

CREATE TABLE "VendorProduct" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "vendorStyleCode" TEXT NOT NULL,
  "hidiStyleCode" TEXT,
  "vendorProductName" TEXT,
  "hsn" TEXT,
  "defaultUnitCostPaise" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorProduct_vendorId_vendorStyleCode_key"
  ON "VendorProduct"("vendorId", "vendorStyleCode");
CREATE INDEX "VendorProduct_productId_idx" ON "VendorProduct"("productId");
CREATE INDEX "VendorProduct_hidiStyleCode_idx" ON "VendorProduct"("hidiStyleCode");
CREATE INDEX "VendorProduct_vendorId_active_idx" ON "VendorProduct"("vendorId", "active");

CREATE TABLE "VendorPackPattern" (
  "id" TEXT NOT NULL,
  "vendorProductId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorPackPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorPackPattern_vendorProductId_variantId_key"
  ON "VendorPackPattern"("vendorProductId", "variantId");
CREATE INDEX "VendorPackPattern_variantId_idx" ON "VendorPackPattern"("variantId");

CREATE TABLE "VendorInvoice" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceDate" TIMESTAMP(3) NOT NULL,
  "purchaseReference" TEXT,
  "originalFilename" TEXT,
  "documentUrl" TEXT,
  "rawText" TEXT,
  "status" "VendorInvoiceStatus" NOT NULL DEFAULT 'UPLOADED',
  "subtotalPaise" INTEGER,
  "taxPaise" INTEGER,
  "totalPaise" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorInvoice_vendorId_invoiceNumber_key"
  ON "VendorInvoice"("vendorId", "invoiceNumber");
CREATE INDEX "VendorInvoice_status_invoiceDate_idx"
  ON "VendorInvoice"("status", "invoiceDate");
CREATE INDEX "VendorInvoice_vendorId_invoiceDate_idx"
  ON "VendorInvoice"("vendorId", "invoiceDate");

CREATE TABLE "VendorInvoiceLine" (
  "id" TEXT NOT NULL,
  "vendorInvoiceId" TEXT NOT NULL,
  "vendorProductId" TEXT,
  "rawDescription" TEXT NOT NULL,
  "vendorStyleCode" TEXT,
  "hsn" TEXT,
  "invoiceQuantity" INTEGER NOT NULL,
  "unitCostPaise" INTEGER,
  "amountPaise" INTEGER,
  "breakupSource" "InvoiceBreakupSource",
  "mappingConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorInvoiceLine_vendorInvoiceId_idx" ON "VendorInvoiceLine"("vendorInvoiceId");
CREATE INDEX "VendorInvoiceLine_vendorProductId_idx" ON "VendorInvoiceLine"("vendorProductId");
CREATE INDEX "VendorInvoiceLine_vendorStyleCode_idx" ON "VendorInvoiceLine"("vendorStyleCode");

CREATE TABLE "VendorInvoiceExpectedVariant" (
  "id" TEXT NOT NULL,
  "invoiceLineId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "expectedQuantity" INTEGER NOT NULL,
  "source" "InvoiceBreakupSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorInvoiceExpectedVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorInvoiceExpectedVariant_invoiceLineId_variantId_key"
  ON "VendorInvoiceExpectedVariant"("invoiceLineId", "variantId");
CREATE INDEX "VendorInvoiceExpectedVariant_variantId_idx"
  ON "VendorInvoiceExpectedVariant"("variantId");

ALTER TABLE "StockReceipt"
  ADD COLUMN "vendorInvoiceId" TEXT;

ALTER TABLE "StockReceiptLine"
  ADD COLUMN "vendorInvoiceLineId" TEXT;

CREATE INDEX "StockReceipt_vendorInvoiceId_receivedAt_idx"
  ON "StockReceipt"("vendorInvoiceId", "receivedAt");
CREATE INDEX "StockReceiptLine_vendorInvoiceLineId_idx"
  ON "StockReceiptLine"("vendorInvoiceLineId");

CREATE TABLE "StockLot" (
  "id" TEXT NOT NULL,
  "lotCode" TEXT NOT NULL,
  "receiptLineId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "vendorInvoiceLineId" TEXT,
  "acceptedQuantity" INTEGER NOT NULL,
  "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockLot_lotCode_key" ON "StockLot"("lotCode");
CREATE INDEX "StockLot_variantId_createdAt_idx" ON "StockLot"("variantId", "createdAt");
CREATE INDEX "StockLot_vendorInvoiceLineId_idx" ON "StockLot"("vendorInvoiceLineId");

CREATE TABLE "CustomerInvoice" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "status" "CustomerInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subtotalPaise" INTEGER NOT NULL,
  "discountPaise" INTEGER NOT NULL,
  "shippingPaise" INTEGER NOT NULL,
  "taxPaise" INTEGER NOT NULL,
  "totalPaise" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerInvoice_orderId_key" ON "CustomerInvoice"("orderId");
CREATE UNIQUE INDEX "CustomerInvoice_invoiceNumber_key" ON "CustomerInvoice"("invoiceNumber");
CREATE INDEX "CustomerInvoice_issuedAt_idx" ON "CustomerInvoice"("issuedAt");

CREATE TABLE "OrderStockAllocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "stockLotId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "scanPayload" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStockAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderStockAllocation_orderItemId_stockLotId_key"
  ON "OrderStockAllocation"("orderItemId", "stockLotId");
CREATE INDEX "OrderStockAllocation_orderId_idx" ON "OrderStockAllocation"("orderId");
CREATE INDEX "OrderStockAllocation_variantId_idx" ON "OrderStockAllocation"("variantId");
CREATE INDEX "OrderStockAllocation_stockLotId_idx" ON "OrderStockAllocation"("stockLotId");

ALTER TABLE "VendorProduct"
  ADD CONSTRAINT "VendorProduct_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorProduct"
  ADD CONSTRAINT "VendorProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorPackPattern"
  ADD CONSTRAINT "VendorPackPattern_vendorProductId_fkey"
  FOREIGN KEY ("vendorProductId") REFERENCES "VendorProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorPackPattern"
  ADD CONSTRAINT "VendorPackPattern_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorInvoice"
  ADD CONSTRAINT "VendorInvoice_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorInvoiceLine"
  ADD CONSTRAINT "VendorInvoiceLine_vendorInvoiceId_fkey"
  FOREIGN KEY ("vendorInvoiceId") REFERENCES "VendorInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorInvoiceLine"
  ADD CONSTRAINT "VendorInvoiceLine_vendorProductId_fkey"
  FOREIGN KEY ("vendorProductId") REFERENCES "VendorProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorInvoiceExpectedVariant"
  ADD CONSTRAINT "VendorInvoiceExpectedVariant_invoiceLineId_fkey"
  FOREIGN KEY ("invoiceLineId") REFERENCES "VendorInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorInvoiceExpectedVariant"
  ADD CONSTRAINT "VendorInvoiceExpectedVariant_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReceipt"
  ADD CONSTRAINT "StockReceipt_vendorInvoiceId_fkey"
  FOREIGN KEY ("vendorInvoiceId") REFERENCES "VendorInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReceiptLine"
  ADD CONSTRAINT "StockReceiptLine_vendorInvoiceLineId_fkey"
  FOREIGN KEY ("vendorInvoiceLineId") REFERENCES "VendorInvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_receiptLineId_fkey"
  FOREIGN KEY ("receiptLineId") REFERENCES "StockReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_vendorInvoiceLineId_fkey"
  FOREIGN KEY ("vendorInvoiceLineId") REFERENCES "VendorInvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerInvoice"
  ADD CONSTRAINT "CustomerInvoice_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderStockAllocation"
  ADD CONSTRAINT "OrderStockAllocation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderStockAllocation"
  ADD CONSTRAINT "OrderStockAllocation_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderStockAllocation"
  ADD CONSTRAINT "OrderStockAllocation_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderStockAllocation"
  ADD CONSTRAINT "OrderStockAllocation_stockLotId_fkey"
  FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep new procurement/traceability tables aligned with HIDI's server-only
-- database access model. Browser/PostgREST roles must not access these tables.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Vendor',
    'VendorProduct',
    'VendorPackPattern',
    'VendorInvoice',
    'VendorInvoiceLine',
    'VendorInvoiceExpectedVariant',
    'StockLot',
    'CustomerInvoice',
    'OrderStockAllocation'
  ]
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
