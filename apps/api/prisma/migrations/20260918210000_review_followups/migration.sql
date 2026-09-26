CREATE TYPE "ReviewFollowUpStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TYPE "ReviewFollowUpChannel" AS ENUM ('EMAIL');

CREATE TABLE "ReviewFollowUp" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "channel" "ReviewFollowUpChannel" NOT NULL DEFAULT 'EMAIL',
  "status" "ReviewFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReviewFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewFollowUp_orderId_channel_key" ON "ReviewFollowUp"("orderId", "channel");
CREATE INDEX "ReviewFollowUp_status_dueAt_idx" ON "ReviewFollowUp"("status", "dueAt");
CREATE INDEX "ReviewFollowUp_orderId_idx" ON "ReviewFollowUp"("orderId");

ALTER TABLE "ReviewFollowUp"
ADD CONSTRAINT "ReviewFollowUp_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
