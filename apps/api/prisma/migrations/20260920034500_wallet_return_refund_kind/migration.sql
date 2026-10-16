-- Return refunds credited to HIDI Wallet are positive, append-only ledger events.
-- The original wallet constraint predates RETURN_REFUND and rejects these credits.
ALTER TABLE "WalletLedger"
  DROP CONSTRAINT IF EXISTS "WalletLedger_entry_check";

ALTER TABLE "WalletLedger"
  ADD CONSTRAINT "WalletLedger_entry_check" CHECK (
    ("kind" IN ('EARN', 'REFUND_REDEEM', 'RETURN_REFUND') AND "deltaPaise" > 0) OR
    ("kind" IN ('REDEEM', 'REVERSE_EARN') AND "deltaPaise" < 0)
  );
