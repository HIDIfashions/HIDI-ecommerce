import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiCart, SavedForLaterItem } from "../models/cart";

const keys = {
  session: "hidi.mobile.cartSession.v1",
  acknowledgedCart: "hidi.mobile.acknowledgedCart.v1",
  savedForLater: "hidi.mobile.savedForLater.v1",
};

function makeSessionId() {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return "mobile-" + Date.now().toString(36) + "-" + random.slice(0, 24);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const cartStorage = {
  async sessionId() {
    const existing = await AsyncStorage.getItem(keys.session).catch(() => null);
    if (existing && existing.length >= 8) return existing;
    const next = makeSessionId();
    await AsyncStorage.setItem(keys.session, next);
    return next;
  },

  acknowledgedCart: () => readJson<ApiCart | null>(keys.acknowledgedCart, null),

  async acknowledgeCart(cart: ApiCart) {
    await writeJson(keys.acknowledgedCart, cart);
  },

  savedForLater: () => readJson<SavedForLaterItem[]>(keys.savedForLater, []),

  async saveForLater(item: SavedForLaterItem) {
    const current = await this.savedForLater();
    const next = [item, ...current.filter((entry) => entry.key !== item.key)];
    await writeJson(keys.savedForLater, next);
    return next;
  },

  async removeSavedForLater(key: string) {
    const current = await this.savedForLater();
    const next = current.filter((entry) => entry.key !== key);
    await writeJson(keys.savedForLater, next);
    return next;
  },
};
