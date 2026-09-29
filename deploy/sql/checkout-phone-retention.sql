-- Run periodically through the EXISTING maintenance process after schema installation.
-- Bounded batches. Never prune an active attempt, grant, or one-hour rate bucket.
-- HMACs are pseudonymous sensitive data: keep access restricted; no raw phone/OTP is stored.
SET XACT_ABORT ON;
DECLARE @cutoff DATETIME2 = DATEADD(DAY, -1, SYSUTCDATETIME());
DELETE TOP (1000) FROM [dbo].[CheckoutPhoneChallenge]
WHERE [createdAt] < @cutoff AND [expiresAt] < @cutoff
  AND ([grantExpiresAt] IS NULL OR [grantExpiresAt] < @cutoff);
DELETE TOP (1000) FROM [dbo].[CheckoutPhoneRate]
WHERE [windowStartedAt] < @cutoff AND [lastSentAt] < @cutoff;
