import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabParamList = {
  Home: undefined;
  Trends: undefined;
  Categories: undefined;
  Bag: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  Catalog: { title?: string; collectionSlug?: string; categorySlug?: string; query?: string } | undefined;
  Product: { slug: string };
  Search: undefined;
  Wishlist: undefined;
  Insider: undefined;
  Login: { returnTo?: keyof TabParamList } | undefined;
  Orders: undefined;
  CheckoutAddress: undefined;
  CheckoutSummary: { addressId: string };
  CheckoutPayment: { addressId: string };
};
