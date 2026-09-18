ALTER TABLE "ReviewFollowUp"
ADD COLUMN "reviewToken" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ReviewFollowUp_reviewToken_key" ON "ReviewFollowUp"("reviewToken");

CREATE TABLE "ProductReview" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "verifiedPurchase" BOOLEAN NOT NULL DEFAULT true,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX "ProductReview_orderItemId_key" ON "ProductReview"("orderItemId");
CREATE INDEX "ProductReview_productId_published_createdAt_idx" ON "ProductReview"("productId", "published", "createdAt");
CREATE INDEX "ProductReview_orderId_idx" ON "ProductReview"("orderId");

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
