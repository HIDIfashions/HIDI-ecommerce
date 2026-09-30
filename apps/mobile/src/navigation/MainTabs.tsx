import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList, RootTabParamList } from "./types";
import HomeScreen from "../screens/discover/HomeScreen";
import ShopCategoriesScreen from "../screens/discover/ShopCategoriesScreen";
import SavedScreen from "../screens/discover/SavedScreen";
import ShoppingBagScreen from "../screens/bag/ShoppingBagScreen";
import { AccountHomeScreen } from "../screens/account/AccountScreens";
import { useHidiTheme } from "../theme/HidiTheme";
import { useCart } from "../data/CartContext";
import { GrowthEntryPoints } from "../growth/GrowthEntryPoints";
import { ResponsiveTabBar } from "./ResponsiveTabBar";
const Tab = createBottomTabNavigator<RootTabParamList>();
function AccountTabScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "You">) {
  const root = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return <View style={{ flex: 1 }}><AccountHomeScreen navigation={root ?? navigation} /><GrowthEntryPoints area="account" onOpen={feature => root?.navigate("Growth", { feature })} /></View>;
}
function BagTabScreen({ navigation }: BottomTabScreenProps<RootTabParamList, "Bag">) {
  const root = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return <View style={{ flex: 1 }}><ShoppingBagScreen /><GrowthEntryPoints area="bag" onOpen={feature => root?.navigate("Growth", { feature })} /></View>;
}
export default function MainTabs() {
  const { colors } = useHidiTheme(); const { cart } = useCart();
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
    <Tab.Navigator initialRouteName="Home" tabBar={props => <ResponsiveTabBar {...props} />} screenOptions={({ route }) => ({
      headerShown: false, lazy: false, tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.action, tabBarInactiveTintColor: colors.mutedText,
      tabBarBadge: route.name === "Bag" && (cart?.itemCount ?? 0) > 0 ? cart?.itemCount : undefined,
    })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shop" component={ShopCategoriesScreen} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Bag" component={BagTabScreen} />
      <Tab.Screen name="You" component={AccountTabScreen} />
    </Tab.Navigator>
  </SafeAreaView>;
}
