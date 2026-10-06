import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Home, Sparkles, Grid2X2, ShoppingBag, UserRound } from "lucide-react-native";
import type { RootStackParamList, TabParamList } from "./types";
import { colors } from "../theme";
import HomeScreen from "../screens/HomeScreen";
import TrendsScreen from "../screens/TrendsScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import BagScreen from "../screens/BagScreen";
import ProfileScreen from "../screens/ProfileScreen";
import CatalogScreen from "../screens/CatalogScreen";
import ProductScreen from "../screens/ProductScreen";
import SearchScreen from "../screens/SearchScreen";
import WishlistScreen from "../screens/WishlistScreen";
import InsiderScreen from "../screens/InsiderScreen";
import LoginScreen from "../screens/LoginScreen";
import OrdersScreen from "../screens/OrdersScreen";
import { CheckoutAddressScreen, CheckoutSummaryScreen, CheckoutPaymentScreen } from "../screens/CheckoutScreens";
import { useCommerce } from "../store";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const icons = { Home, Trends: Sparkles, Categories: Grid2X2, Bag: ShoppingBag, Profile: UserRound } as const;

function Tabs() {
  const { cart } = useCommerce();
  return <Tab.Navigator screenOptions={({ route }) => {
    const Icon = icons[route.name];
    return {
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarIcon: ({ color, size }) => <Icon color={color} size={Math.min(size, 23)} />,
      tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      tabBarStyle: { height: 68, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.line, backgroundColor: colors.canvas },
      tabBarBadge: route.name === "Bag" && (cart?.itemCount ?? 0) > 0 ? cart?.itemCount : undefined,
      tabBarBadgeStyle: { backgroundColor: colors.accent, color: "white", fontSize: 10 },
    };
  }}>
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Trends" component={TrendsScreen} />
    <Tab.Screen name="Categories" component={CategoriesScreen} />
    <Tab.Screen name="Bag" component={BagScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>;
}

export default function RootNavigator() {
  const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.accent, background: colors.canvas, card: colors.canvas, text: colors.ink, border: colors.line, notification: colors.accent } };
  return <NavigationContainer theme={theme}><Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name="MainTabs" component={Tabs} />
    <Stack.Screen name="Catalog" component={CatalogScreen} />
    <Stack.Screen name="Product" component={ProductScreen} />
    <Stack.Screen name="Search" component={SearchScreen} />
    <Stack.Screen name="Wishlist" component={WishlistScreen} />
    <Stack.Screen name="Insider" component={InsiderScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Orders" component={OrdersScreen} />
    <Stack.Screen name="CheckoutAddress" component={CheckoutAddressScreen} />
    <Stack.Screen name="CheckoutSummary" component={CheckoutSummaryScreen} />
    <Stack.Screen name="CheckoutPayment" component={CheckoutPaymentScreen} />
  </Stack.Navigator></NavigationContainer>;
}
