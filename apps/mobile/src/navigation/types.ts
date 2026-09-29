import type { Filters, SortKey } from "../data/catalog";

export type RootStackParamList = {
  Launch: undefined;
  Welcome: undefined;
  StylePreferences: undefined;
  SignIn: { returnTo?: string } | undefined;
  VerifyPhone: { phone: string; resendAfterSeconds: number; returnTo?: string };
  CompleteProfile: { returnTo?: string } | undefined;
  ConsentPreferences: undefined;
  VerificationLimited: { phone?: string; retryUntil: number };
  MainTabs: undefined;
  Collection: { slug: string; title: string };
  Listing: { title: string; collectionSlug?: string; query?: string; filters?: Filters; sort?: SortKey };
  Search: undefined;
  SearchResults: { query: string; filters?: Filters; sort?: SortKey };
  Filters: { title: string; productsSource: "listing" | "search"; query?: string; collectionSlug?: string; current: Filters; sort?: SortKey };
  RecentlyViewed: undefined;
  ProductDeferred: { slug: string };
};

export type RootTabParamList = {
  Home: undefined;
  Shop: undefined;
  Saved: undefined;
  Bag: undefined;
  You: undefined;
};
