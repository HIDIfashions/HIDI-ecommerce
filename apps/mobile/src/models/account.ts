export type AccountCapability = "supported" | "unavailable" | "local-device-only" | "provider-owned";

export const phase5Capabilities = {
  profilePatch: "supported" as AccountCapability,
  addressBook: "local-device-only" as AccountCapability,
  paymentMethodTokens: "unavailable" as AccountCapability,
  notificationsApi: "unavailable" as AccountCapability,
  helpTopicsApi: "unavailable" as AccountCapability,
  supportTicketsApi: "unavailable" as AccountCapability,
  privacyExportApi: "unavailable" as AccountCapability,
  privacyDeletionApi: "unavailable" as AccountCapability,
  phoneChangeApi: "unavailable" as AccountCapability,
  emailVerificationApi: "unavailable" as AccountCapability,
  guestOrderAccessApi: "unavailable" as AccountCapability,
} as const;

export type SupportTicketDraft = {
  operationId: string;
  orderNumber?: string;
  topic: string;
  subject: string;
  body: string;
  contactPreference: "phone" | "email" | "whatsapp";
};

export type SupportTicket = SupportTicketDraft & {
  caseId: string;
  status: "local_draft" | "submitted";
  createdAt: number;
};

export type NotificationPreference = {
  orderSms: boolean;
  orderWhatsApp: boolean;
  promotional: boolean;
};

export type PrivacyPreference = {
  analytics: boolean;
  personalization: boolean;
  recentHistory: boolean;
  fitData: boolean;
};

export function normalizeOptionalEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

export function sanitizeSupportText(value: string, max = 2000) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function makeOperationId(prefix: string) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function caseIdFromOperation(operationId: string) {
  const safe = operationId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-8) || "LOCAL";
  return "LOCAL-" + safe;
}

export function makeLocalSupportTicket(draft: SupportTicketDraft): SupportTicket {
  return {
    ...draft,
    subject: sanitizeSupportText(draft.subject, 120),
    body: sanitizeSupportText(draft.body, 2000),
    caseId: caseIdFromOperation(draft.operationId),
    status: phase5Capabilities.supportTicketsApi === "supported" ? "submitted" : "local_draft",
    createdAt: Date.now(),
  };
}

export function safeGuestOrderLookup(reference: string, contact: string) {
  const cleanReference = reference.trim().slice(0, 40);
  const cleanContact = contact.trim().slice(0, 80);
  return {
    accepted: Boolean(cleanReference && cleanContact),
    message: cleanReference && cleanContact
      ? "If this order reference and contact match, HIDI will continue only after contact verification. This response does not confirm whether the order exists."
      : "Enter both the order reference and verified contact to continue.",
  };
}

export function canSubmitSupportDraft(subject: string, body: string) {
  return sanitizeSupportText(subject, 120).length >= 4 && sanitizeSupportText(body, 2000).length >= 12;
}
