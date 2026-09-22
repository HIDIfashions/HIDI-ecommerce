-- Permanent internal HIDI product numbering and automatic vendor numbering.
-- This migration intentionally follows the already-applied procurement migration.

CREATE SEQUENCE "hidi_product_code_seq"
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

CREATE SEQUENCE "hidi_vendor_number_seq"
  START WITH 10001
  INCREMENT BY 1
  MINVALUE 1;

ALTER TABLE "Product"
  ADD COLUMN "internalCode" TEXT;

WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n
  FROM "Product"
)
UPDATE "Product" p
SET "internalCode" = 'HIDI-' || lpad(numbered.n::text, 6, '0')
FROM numbered
WHERE p."id" = numbered."id";

DO $$
DECLARE
  max_product_code bigint;
BEGIN
  SELECT COALESCE(
    MAX(substring("internalCode" from '[0-9]+$')::bigint),
    0
  )
  INTO max_product_code
  FROM "Product";

  IF max_product_code > 0 THEN
    PERFORM setval('hidi_product_code_seq', max_product_code, true);
  ELSE
    PERFORM setval('hidi_product_code_seq', 1, false);
  END IF;
END $$;

ALTER TABLE "Product"
  ALTER COLUMN "internalCode" SET NOT NULL;

CREATE UNIQUE INDEX "Product_internalCode_key"
  ON "Product"("internalCode");

ALTER TABLE "Vendor"
  ADD COLUMN "normalizedName" TEXT;

UPDATE "Vendor"
SET "normalizedName" = lower(
  trim(
    regexp_replace(
      regexp_replace("name", '[^A-Za-z0-9]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  )
);

ALTER TABLE "Vendor"
  ALTER COLUMN "normalizedName" SET NOT NULL;

CREATE UNIQUE INDEX "Vendor_normalizedName_key"
  ON "Vendor"("normalizedName");

DO $$
DECLARE
  max_vendor_code bigint;
BEGIN
  SELECT COALESCE(MAX("code"::bigint), 10000)
  INTO max_vendor_code
  FROM "Vendor"
  WHERE "code" ~ '^[0-9]+$';

  PERFORM setval(
    'hidi_vendor_number_seq',
    GREATEST(max_vendor_code, 10000),
    true
  );
END $$;

UPDATE "VendorProduct" vp
SET "hidiStyleCode" = p."internalCode"
FROM "Product" p
WHERE vp."productId" = p."id"
  AND (vp."hidiStyleCode" IS NULL OR trim(vp."hidiStyleCode") = '');

REVOKE ALL ON SEQUENCE "hidi_product_code_seq" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "hidi_vendor_number_seq" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE "hidi_product_code_seq" FROM anon';
    EXECUTE 'REVOKE ALL ON SEQUENCE "hidi_vendor_number_seq" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE "hidi_product_code_seq" FROM authenticated';
    EXECUTE 'REVOKE ALL ON SEQUENCE "hidi_vendor_number_seq" FROM authenticated';
  END IF;
END $$;
