-- Manufacturer goods receipts and SKU-level storefront photography.
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

CREATE TABLE "ProductVariantImage" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT,
    "alt" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "totalAccepted" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockReceipt_totalAccepted_check" CHECK ("totalAccepted" >= 0),
    CONSTRAINT "StockReceipt_totalRejected_check" CHECK ("totalRejected" >= 0)
);

CREATE TABLE "StockReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "acceptedQuantity" INTEGER NOT NULL,
    "rejectedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceiptLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockReceiptLine_acceptedQuantity_check" CHECK ("acceptedQuantity" >= 0),
    CONSTRAINT "StockReceiptLine_rejectedQuantity_check" CHECK ("rejectedQuantity" >= 0),
    CONSTRAINT "StockReceiptLine_unitCostPaise_check" CHECK ("unitCostPaise" IS NULL OR "unitCostPaise" >= 0)
);

CREATE UNIQUE INDEX "ProductVariantImage_variantId_url_key"
ON "ProductVariantImage"("variantId", "url");

CREATE INDEX "ProductVariantImage_variantId_position_idx"
ON "ProductVariantImage"("variantId", "position");

CREATE UNIQUE INDEX "StockReceipt_receiptNumber_key"
ON "StockReceipt"("receiptNumber");

CREATE INDEX "StockReceipt_status_createdAt_idx"
ON "StockReceipt"("status", "createdAt");

CREATE INDEX "StockReceipt_receivedAt_idx"
ON "StockReceipt"("receivedAt");

CREATE UNIQUE INDEX "StockReceiptLine_receiptId_variantId_key"
ON "StockReceiptLine"("receiptId", "variantId");

CREATE INDEX "StockReceiptLine_variantId_idx"
ON "StockReceiptLine"("variantId");

ALTER TABLE "ProductVariantImage"
ADD CONSTRAINT "ProductVariantImage_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceiptLine"
ADD CONSTRAINT "StockReceiptLine_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceiptLine"
ADD CONSTRAINT "StockReceiptLine_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- These admin-owned tables are not intended for direct anon/authenticated Data API access.
ALTER TABLE "ProductVariantImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockReceiptLine" ENABLE ROW LEVEL SECURITY;
