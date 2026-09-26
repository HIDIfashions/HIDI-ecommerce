-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "walletAppliedPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "reservedPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "deltaPaise" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletHold" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardAccrual" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "basisPaise" INTEGER NOT NULL,
    "rewardPaise" INTEGER NOT NULL,
    "returnWindowDays" INTEGER NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "eligibleAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_authSubject_key" ON "WalletAccount"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_eventKey_key" ON "WalletLedger"("eventKey");

-- CreateIndex
CREATE INDEX "WalletLedger_walletId_createdAt_id_idx" ON "WalletLedger"("walletId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WalletLedger_orderId_idx" ON "WalletLedger"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletHold_orderId_key" ON "WalletHold"("orderId");

-- CreateIndex
CREATE INDEX "WalletHold_walletId_status_idx" ON "WalletHold"("walletId", "status");

-- CreateIndex
CREATE INDEX "WalletHold_status_expiresAt_idx" ON "WalletHold"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardAccrual_orderId_key" ON "RewardAccrual"("orderId");

-- CreateIndex
CREATE INDEX "RewardAccrual_walletId_status_idx" ON "RewardAccrual"("walletId", "status");

-- CreateIndex
CREATE INDEX "RewardAccrual_status_eligibleAt_id_idx" ON "RewardAccrual"("status", "eligibleAt", "id");

-- CreateIndex
CREATE INDEX "RewardAccrual_createdAt_id_idx" ON "RewardAccrual"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_providerRefundId_key" ON "PaymentRefund"("providerRefundId");

-- CreateIndex
CREATE INDEX "PaymentRefund_paymentId_status_idx" ON "PaymentRefund"("paymentId", "status");

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardAccrual" ADD CONSTRAINT "RewardAccrual_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardAccrual" ADD CONSTRAINT "RewardAccrual_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- All wallet operations are server-authorized; expose no direct client API.
ALTER TABLE "WalletAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletHold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RewardAccrual" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WalletAccount", "WalletLedger", "WalletHold", "RewardAccrual", "PaymentRefund" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "WalletAccount", "WalletLedger", "WalletHold", "RewardAccrual", "PaymentRefund" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "WalletAccount", "WalletLedger", "WalletHold", "RewardAccrual", "PaymentRefund" FROM authenticated;
  END IF;
END $$;

-- Reversals may create debt; reserved funds must never be negative.
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_funds_check" CHECK ("reservedPaise" >= 0 AND "currency" = 'INR');
ALTER TABLE "Order" ADD CONSTRAINT "Order_wallet_amount_check" CHECK ("walletAppliedPaise" >= 0 AND "walletAppliedPaise" <= "totalPaise");
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_entry_check" CHECK (
  ("kind" IN ('EARN', 'REFUND_REDEEM') AND "deltaPaise" > 0) OR
  ("kind" IN ('REDEEM', 'REVERSE_EARN') AND "deltaPaise" < 0)
);
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_state_check" CHECK ("amountPaise" > 0 AND "status" IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'REFUNDED'));
ALTER TABLE "RewardAccrual" ADD CONSTRAINT "RewardAccrual_policy_check" CHECK ("basisPaise" >= 0 AND "rewardPaise" >= 0 AND "returnWindowDays" BETWEEN 1 AND 365 AND "status" IN ('PENDING', 'HELD', 'CREDITED', 'REVERSED'));
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_amount_check" CHECK ("amountPaise" >= 0 AND "status" = 'PROCESSED');

-- Protect the audit trail even from accidental writes by the server role.
CREATE FUNCTION hidi_wallet_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Wallet ledger is append-only; record a compensating entry instead';
END;
$$;
REVOKE ALL ON FUNCTION hidi_wallet_ledger_immutable() FROM PUBLIC;
CREATE TRIGGER "WalletLedger_immutable"
BEFORE UPDATE OR DELETE ON "WalletLedger"
FOR EACH ROW EXECUTE FUNCTION hidi_wallet_ledger_immutable();
