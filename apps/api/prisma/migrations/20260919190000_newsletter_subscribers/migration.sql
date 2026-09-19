CREATE TABLE "NewsletterSubscriber" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'FOOTER',
  "consentVersion" TEXT NOT NULL DEFAULT 'hidi-newsletter-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscriber_email_key"
ON "NewsletterSubscriber"("email");

CREATE INDEX "NewsletterSubscriber_status_createdAt_idx"
ON "NewsletterSubscriber"("status", "createdAt");
