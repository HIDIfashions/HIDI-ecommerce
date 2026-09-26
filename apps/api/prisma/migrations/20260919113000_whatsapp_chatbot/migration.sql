CREATE TABLE "WhatsAppConversation" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'IDLE',
  "context" JSONB,
  "lastInboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "providerMessageSid" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConversation_phone_key" ON "WhatsAppConversation"("phone");
CREATE INDEX "WhatsAppConversation_state_updatedAt_idx" ON "WhatsAppConversation"("state", "updatedAt");
CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageSid_key" ON "WhatsAppMessage"("providerMessageSid");
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

ALTER TABLE "WhatsAppMessage"
ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
