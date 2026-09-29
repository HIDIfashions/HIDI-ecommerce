import AsyncStorage from "@react-native-async-storage/async-storage";

const keys = {
  onboardingSeen: "hidi.mobile.onboardingSeen.v1",
  stylePreferences: "hidi.mobile.stylePreferences.v1",
  wishlist: "hidi.mobile.wishlist.v1",
  recentlyViewed: "hidi.mobile.recentlyViewed.v1",
  recentSearches: "hidi.mobile.recentSearches.v1",
  catalogCache: "hidi.mobile.catalogCache.v1",
  consentDraft: "hidi.mobile.consentDraft.v1",
  lastSafeRoute: "hidi.mobile.lastSafeRoute.v1",
};

export type RecentVisit = { slug: string; viewedAt: number };

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

async function setJson<T>(key: string, value: T) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browsing must continue if local storage is unavailable.
  }
}

export const localStore = {
  async onboardingSeen() {
    return (await AsyncStorage.getItem(keys.onboardingSeen).catch(() => null)) === "1";
  },
  async setOnboardingSeen() {
    await AsyncStorage.setItem(keys.onboardingSeen, "1").catch(() => undefined);
  },
  stylePreferences: () => getJson<string[]>(keys.stylePreferences, []),
  saveStylePreferences: (values: string[]) => setJson(keys.stylePreferences, Array.from(new Set(values))),
  wishlist: () => getJson<string[]>(keys.wishlist, []),
  async setWishlist(slugs: string[]) {
    await setJson(keys.wishlist, Array.from(new Set(slugs)));
  },
  async toggleWishlist(slug: string) {
    const current = await this.wishlist();
    const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
    await this.setWishlist(next);
    return next;
  },
  recentlyViewed: () => getJson<RecentVisit[]>(keys.recentlyViewed, []),
  async rememberViewed(slug: string) {
    const existing = await this.recentlyViewed();
    const next = [{ slug, viewedAt: Date.now() }, ...existing.filter((item) => item.slug !== slug)].slice(0, 12);
    await setJson(keys.recentlyViewed, next);
  },
  async clearRecentlyViewed() {
    await setJson(keys.recentlyViewed, []);
  },
  recentSearches: () => getJson<string[]>(keys.recentSearches, []),
  async rememberSearch(query: string) {
    const clean = query.trim().slice(0, 160);
    if (!clean) return;
    const existing = await this.recentSearches();
    await setJson(keys.recentSearches, [clean, ...existing.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 8));
  },
  async removeSearch(query: string) {
    const existing = await this.recentSearches();
    await setJson(keys.recentSearches, existing.filter((item) => item !== query));
  },
  clearSearches: () => setJson(keys.recentSearches, []),
  catalogCache: () => getJson<{ savedAt: number; products: unknown[] } | null>(keys.catalogCache, null),
  saveCatalogCache: (products: unknown[]) => setJson(keys.catalogCache, { savedAt: Date.now(), products }),
  consentDraft: () => getJson<{ personalizationOptIn: boolean; whatsappOptIn: boolean }>(keys.consentDraft, { personalizationOptIn: false, whatsappOptIn: false }),
  saveConsentDraft: (value: { personalizationOptIn: boolean; whatsappOptIn: boolean }) => setJson(keys.consentDraft, value),
  lastSafeRoute: () => AsyncStorage.getItem(keys.lastSafeRoute).catch(() => null),
  saveLastSafeRoute: (route: string) => AsyncStorage.setItem(keys.lastSafeRoute, route).catch(() => undefined),
};
