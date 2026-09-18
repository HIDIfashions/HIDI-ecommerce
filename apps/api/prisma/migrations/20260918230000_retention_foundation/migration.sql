-- CreateTable
CREATE TABLE "RetentionProfile" (
    "id" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "personalizationOptIn" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT NOT NULL DEFAULT 'hidi-retention-v1',
    "verifiedPhone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "consentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionConsentAudit" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "whatsappOptIn" BOOLEAN NOT NULL,
    "personalizationOptIn" BOOLEAN NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verifiedPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionConsentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "kind" TEXT NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionDelivery" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetentionProfile_authSubject_key" ON "RetentionProfile"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionProfile_userId_key" ON "RetentionProfile"("userId");

-- CreateIndex
CREATE INDEX "RetentionConsentAudit_profileId_createdAt_idx" ON "RetentionConsentAudit"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionEvent_profileId_productId_createdAt_idx" ON "RetentionEvent"("profileId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionEvent_createdAt_idx" ON "RetentionEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionDelivery_episodeKey_key" ON "RetentionDelivery"("episodeKey");

-- CreateIndex
CREATE INDEX "RetentionDelivery_profileId_category_sentAt_idx" ON "RetentionDelivery"("profileId", "category", "sentAt");

-- AddForeignKey
ALTER TABLE "RetentionProfile" ADD CONSTRAINT "RetentionProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionConsentAudit" ADD CONSTRAINT "RetentionConsentAudit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RetentionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionEvent" ADD CONSTRAINT "RetentionEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RetentionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDelivery" ADD CONSTRAINT "RetentionDelivery_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RetentionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Private application data is accessed only through the authenticated NestJS backend.
ALTER TABLE "RetentionProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionConsentAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionDelivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RetentionProfile", "RetentionConsentAudit", "RetentionEvent", "RetentionDelivery" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "RetentionProfile", "RetentionConsentAudit", "RetentionEvent", "RetentionDelivery" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "RetentionProfile", "RetentionConsentAudit", "RetentionEvent", "RetentionDelivery" FROM authenticated;
  END IF;
END $$;

ALTER TABLE "RetentionEvent" ADD CONSTRAINT "RetentionEvent_kind_check"
CHECK ("kind" IN ('DETAIL_VIEW', 'SIZE_SELECT'));
