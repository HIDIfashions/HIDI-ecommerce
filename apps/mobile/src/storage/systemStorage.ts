import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAppearancePreference } from "../models/system";
import type { AppearancePreference } from "../models/system";

const keys = {
  appearancePreference: "hidi.mobile.appearancePreference.v1",
  optionalUpdateDismissedAt: "hidi.mobile.optionalUpdateDismissedAt.v1",
  permissionContext: "hidi.mobile.permissionContext.v1",
};

export const systemStorage = {
  async appearancePreference(): Promise<AppearancePreference> {
    const raw = await AsyncStorage.getItem(keys.appearancePreference).catch(() => null);
    return isAppearancePreference(raw) ? raw : "system";
  },
  saveAppearancePreference(value: AppearancePreference) {
    return AsyncStorage.setItem(keys.appearancePreference, value).catch(() => undefined);
  },
  async optionalUpdateDismissedAt() {
    const raw = await AsyncStorage.getItem(keys.optionalUpdateDismissedAt).catch(() => null);
    const value = Number(raw ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  },
  dismissOptionalUpdate(timestamp = Date.now()) {
    return AsyncStorage.setItem(keys.optionalUpdateDismissedAt, String(timestamp)).catch(() => undefined);
  },
  savePermissionContext(value: { feature: string; returnTo?: string; result?: string; updatedAt: number }) {
    return AsyncStorage.setItem(keys.permissionContext, JSON.stringify(value)).catch(() => undefined);
  },
};
