import React from "react";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Grid2X2, Heart, House, ShoppingBag, UserRound } from "lucide-react-native";
import type { RootStackParamList, RootTabParamList } from "./types";
import HomeScreen from "../screens/discover/HomeScreen";
import ShopCategoriesScreen from "../screens/discover/ShopCategoriesScreen";
import SavedScreen from "../screens/discover/SavedScreen";
import ShoppingBagScreen from "../screens/bag/ShoppingBagScreen";
import { AccountHomeScreen } from "../screens/account/AccountScreens";
import { useHidiTheme } from "../theme/HidiTheme";
import { useCart } from "../data/CartContext";
import { GrowthEntryPoints } from "../growth/GrowthEntryPoints";
const Tab = createBottomTabNavigator<RootTabParamList>();
function AccountTabScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "You">) {
  const root = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return <View style={{ flex: 1 }}><AccountHomeScreen navigation={root ?? navigation} /><GrowthEntryPoints area="account" onOpen={feature => root?.navigate("Growth", { feature })} /></View>;
}
function BagTabScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "Bag">) {
  const root = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return <View style={{ flex: 1 }}><ShoppingBagScreen /><GrowthEntryPoints area="bag" onOpen={feature => root?.navigate("Growth", { feature })} /></View>;
}
function icon(route: keyof RootTabParamList, color: string, size: number) {
  const Icon = route === "Home" ? House : route === "Shop" ? Grid2X2 : route === "Saved" ? Heart : route === "Bag" ? ShoppingBag : UserRound;
  return <Icon size={size} color={color} />;
}
export default function MainTabs() {
  const { colors } = useHidiTheme(); const { cart } = useCart();
  const insets = useSafeAreaInsets(); const { fontScale } = useWindowDimensions();
  const bottom = Math.max(insets.bottom, 8);
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
    <Tab.Navigator initialRouteName="Home" screenOptions={({ route }) => ({
      headerShown: false, lazy: false, tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.action, tabBarInactiveTintColor: colors.mutedText,
      tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.border, height: 58 + bottom + Math.max(0, fontScale - 1) * 16, paddingTop: 6, paddingBottom: bottom },
      tabBarLabelStyle: { fontSize: 12 }, tabBarIcon: ({ color, size }) => icon(route.name, color, Math.min(size, 22)),
      tabBarBadge: route.name === "Bag" && (cart?.itemCount ?? 0) > 0 ? cart?.itemCount : undefined,
      tabBarBadgeStyle: { backgroundColor: colors.action, color: colors.canvas, fontSize: 12 },
    })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shop" component={ShopCategoriesScreen} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Bag" component={BagTabScreen} />
      <Tab.Screen name="You" component={AccountTabScreen} />
    </Tab.Navigator>
  </SafeAreaView>;
}
