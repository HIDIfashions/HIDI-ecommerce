import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";
import type { Address, AuthSession, Product } from "./domain";

const keys = {
  sessionId: "hidi.v2.session-id",
  wishlist: "hidi.v2.wishlist",
  catalog: "hidi.v2.catalog",
  addresses: "hidi.v2.addresses",
  recent: "hidi.v2.recent",
};
const AUTH_SERVICE = "com.thehidi.premium.auth";
async function read<T>(key: string, fallback: T): Promise<T> { try { const value = await AsyncStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
async function write(key: string, value: unknown) { await AsyncStorage.setItem(key, JSON.stringify(value)); }
function randomId(prefix: string) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }

export const storage = {
  async sessionId() { const existing = await AsyncStorage.getItem(keys.sessionId); if (existing) return existing; const value = randomId("mobile"); await AsyncStorage.setItem(keys.sessionId, value); return value; },
  wishlist: () => read<string[]>(keys.wishlist, []),
  saveWishlist: (value: string[]) => write(keys.wishlist, Array.from(new Set(value))),
  catalog: () => read<{ savedAt: number; products: Product[] } | null>(keys.catalog, null),
  saveCatalog: (products: Product[]) => write(keys.catalog, { savedAt: Date.now(), products }),
  addresses: () => read<Address[]>(keys.addresses, []),
  saveAddresses: (value: Address[]) => write(keys.addresses, value),
  recent: () => read<string[]>(keys.recent, []),
  async remember(slug: string) { const current = await this.recent(); await write(keys.recent, [slug, ...current.filter(x => x !== slug)].slice(0, 20)); },
  async auth() { const result = await Keychain.getGenericPassword({ service: AUTH_SERVICE }).catch(() => false); if (!result || typeof result !== "object") return null; try { return JSON.parse(result.password) as AuthSession; } catch { return null; } },
  saveAuth: (session: AuthSession) => Keychain.setGenericPassword("hidi", JSON.stringify(session), { service: AUTH_SERVICE }),
  clearAuth: () => Keychain.resetGenericPassword({ service: AUTH_SERVICE }),
  newAddressId: () => randomId("address"),
};
