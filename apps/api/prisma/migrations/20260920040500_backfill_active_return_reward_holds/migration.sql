-- Older return requests could exist before reward-hold logic was introduced.
-- Backfill those accruals so active returns never remain in PENDING.
UPDATE "RewardAccrual" ra
SET
  "status" = 'HELD',
  "reason" = 'ACTIVE_RETURN_BACKFILL',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE ra."status" = 'PENDING'
  AND EXISTS (
    SELECT 1
    FROM "ReturnRequest" rr
    WHERE rr."orderId" = ra."orderId"
      AND rr."status" IN ('REQUESTED','APPROVED','PICKUP_SCHEDULED','RECEIVED','REFUND_PROCESSING','EXCHANGE_SHIPPED')
  );
