CREATE TABLE "ReturnRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "refundDestination" TEXT,
  "requestedVariantId" TEXT,
  "requestedSize" TEXT,
  "refundPaise" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReturnRequest_orderId_status_createdAt_idx"
ON "ReturnRequest"("orderId", "status", "createdAt");

CREATE INDEX "ReturnRequest_orderItemId_status_idx"
ON "ReturnRequest"("orderItemId", "status");

ALTER TABLE "ReturnRequest"
ADD CONSTRAINT "ReturnRequest_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReturnRequest"
ADD CONSTRAINT "ReturnRequest_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
