import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NotificationPreference, PrivacyPreference, SupportTicket, SupportTicketDraft } from "../models/account";
import { makeLocalSupportTicket } from "../models/account";

const keys = {
  notificationPreferences: "hidi.mobile.notificationPreferences.v1",
  privacyPreferences: "hidi.mobile.privacyPreferences.v1",
  supportTickets: "hidi.mobile.supportTickets.v1",
  supportDraft: "hidi.mobile.supportDraft.v1",
  dataExportRequest: "hidi.mobile.dataExportRequest.v1",
  deletionRequest: "hidi.mobile.deletionRequest.v1",
  guestOrderLookup: "hidi.mobile.guestOrderLookup.v1",
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

export const defaultNotificationPreference: NotificationPreference = {
  orderSms: true,
  orderWhatsApp: true,
  promotional: false,
};

export const defaultPrivacyPreference: PrivacyPreference = {
  analytics: false,
  personalization: false,
  recentHistory: true,
  fitData: false,
};

export const accountStorage = {
  notificationPreferences: () => readJson<NotificationPreference>(keys.notificationPreferences, defaultNotificationPreference),
  saveNotificationPreferences: (value: NotificationPreference) => writeJson(keys.notificationPreferences, value),

  privacyPreferences: () => readJson<PrivacyPreference>(keys.privacyPreferences, defaultPrivacyPreference),
  savePrivacyPreferences: (value: PrivacyPreference) => writeJson(keys.privacyPreferences, value),

  supportTickets: () => readJson<SupportTicket[]>(keys.supportTickets, []),

  async createOrGetSupportTicket(draft: SupportTicketDraft) {
    const current = await this.supportTickets();
    const existing = current.find((ticket) => ticket.operationId === draft.operationId);
    if (existing) return existing;
    const ticket = makeLocalSupportTicket(draft);
    await writeJson(keys.supportTickets, [ticket, ...current].slice(0, 20));
    await AsyncStorage.removeItem(keys.supportDraft).catch(() => undefined);
    return ticket;
  },

  saveSupportDraft: (draft: Partial<SupportTicketDraft>) => writeJson(keys.supportDraft, draft),
  supportDraft: () => readJson<Partial<SupportTicketDraft>>(keys.supportDraft, {}),
  clearSupportDraft: () => AsyncStorage.removeItem(keys.supportDraft).catch(() => undefined),

  supportTicket: async (caseId: string) => (await accountStorage.supportTickets()).find((ticket) => ticket.caseId === caseId) ?? null,

  async requestDataExport() {
    const request = { requestId: "EXPORT-" + Date.now().toString(36).toUpperCase(), createdAt: Date.now(), status: "local_request_recorded" as const };
    await writeJson(keys.dataExportRequest, request);
    return request;
  },
  dataExportRequest: () => readJson<{ requestId: string; createdAt: number; status: string } | null>(keys.dataExportRequest, null),

  async requestDeletion() {
    const request = { requestId: "DELETE-" + Date.now().toString(36).toUpperCase(), createdAt: Date.now(), status: "local_request_recorded" as const };
    await writeJson(keys.deletionRequest, request);
    return request;
  },
  deletionRequest: () => readJson<{ requestId: string; createdAt: number; status: string } | null>(keys.deletionRequest, null),

  saveGuestOrderLookup: (value: { reference: string; contact: string; checkedAt: number }) => writeJson(keys.guestOrderLookup, value),

  async clearSensitiveLocalAccountData() {
    await Promise.all([
      AsyncStorage.removeItem(keys.supportTickets).catch(() => undefined),
      AsyncStorage.removeItem(keys.supportDraft).catch(() => undefined),
      AsyncStorage.removeItem(keys.dataExportRequest).catch(() => undefined),
      AsyncStorage.removeItem(keys.deletionRequest).catch(() => undefined),
      AsyncStorage.removeItem(keys.guestOrderLookup).catch(() => undefined),
    ]);
  },
};
