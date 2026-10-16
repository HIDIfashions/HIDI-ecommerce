ALTER TABLE "ProductVariant"
  ADD COLUMN "bustMm" INTEGER,
  ADD COLUMN "waistMm" INTEGER,
  ADD COLUMN "hipMm" INTEGER,
  ADD COLUMN "shoulderMm" INTEGER,
  ADD COLUMN "sleeveLengthMm" INTEGER,
  ADD COLUMN "garmentLengthMm" INTEGER;

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_bustMm_check" CHECK ("bustMm" IS NULL OR ("bustMm" >= 200 AND "bustMm" <= 3000)),
  ADD CONSTRAINT "ProductVariant_waistMm_check" CHECK ("waistMm" IS NULL OR ("waistMm" >= 200 AND "waistMm" <= 3000)),
  ADD CONSTRAINT "ProductVariant_hipMm_check" CHECK ("hipMm" IS NULL OR ("hipMm" >= 200 AND "hipMm" <= 3000)),
  ADD CONSTRAINT "ProductVariant_shoulderMm_check" CHECK ("shoulderMm" IS NULL OR ("shoulderMm" >= 100 AND "shoulderMm" <= 1000)),
  ADD CONSTRAINT "ProductVariant_sleeveLengthMm_check" CHECK ("sleeveLengthMm" IS NULL OR ("sleeveLengthMm" >= 50 AND "sleeveLengthMm" <= 1500)),
  ADD CONSTRAINT "ProductVariant_garmentLengthMm_check" CHECK ("garmentLengthMm" IS NULL OR ("garmentLengthMm" >= 100 AND "garmentLengthMm" <= 2500));
