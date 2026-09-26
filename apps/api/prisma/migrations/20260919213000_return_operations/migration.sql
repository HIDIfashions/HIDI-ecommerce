ALTER TABLE "ReturnRequest"
  ADD COLUMN "adminNote" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "pickupProvider" TEXT,
  ADD COLUMN "pickupAwb" TEXT,
  ADD COLUMN "pickupTrackingUrl" TEXT,
  ADD COLUMN "pickupScheduledAt" TIMESTAMP(3),
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "inventoryDisposition" TEXT,
  ADD COLUMN "refundWalletPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundCashPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundStatus" TEXT,
  ADD COLUMN "refundProviderId" TEXT,
  ADD COLUMN "replacementProvider" TEXT,
  ADD COLUMN "replacementAwb" TEXT,
  ADD COLUMN "replacementTrackingUrl" TEXT,
  ADD COLUMN "replacementShippedAt" TIMESTAMP(3),
  ADD COLUMN "exchangeReservationStatus" TEXT,
  ADD COLUMN "exchangeReservedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ReturnRequest_refundProviderId_key"
  ON "ReturnRequest"("refundProviderId");

CREATE INDEX "ReturnRequest_status_updatedAt_idx"
  ON "ReturnRequest"("status", "updatedAt");

CREATE UNIQUE INDEX "ReturnRequest_active_orderItem_key"
  ON "ReturnRequest"("orderItemId")
  WHERE "status" IN ('REQUESTED','APPROVED','PICKUP_SCHEDULED','RECEIVED','REFUND_PROCESSING','EXCHANGE_SHIPPED');

ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "ReturnRequest_refund_nonnegative" CHECK ("refundPaise" >= 0 AND "refundWalletPaise" >= 0 AND "refundCashPaise" >= 0);
