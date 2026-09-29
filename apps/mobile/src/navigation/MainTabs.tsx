import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Grid2X2, Heart, House, ShoppingBag, UserRound } from "lucide-react-native";
import type { RootTabParamList } from "./types";
import HomeScreen from "../screens/discover/HomeScreen";
import ShopCategoriesScreen from "../screens/discover/ShopCategoriesScreen";
import SavedScreen from "../screens/discover/SavedScreen";
import ShoppingBagScreen from "../screens/bag/ShoppingBagScreen";
import { AccountHomeScreen } from "../screens/account/AccountScreens";
import { useHidiTheme } from "../theme/HidiTheme";
import { useCart } from "../data/CartContext";

const Tab = createBottomTabNavigator<RootTabParamList>();

function icon(route: keyof RootTabParamList, color: string, size: number) {
  if (route === "Home") return <House size={size} color={color} />;
  if (route === "Shop") return <Grid2X2 size={size} color={color} />;
  if (route === "Saved") return <Heart size={size} color={color} />;
  if (route === "Bag") return <ShoppingBag size={size} color={color} />;
  return <UserRound size={size} color={color} />;
}

export default function MainTabs() {
  const { colors } = useHidiTheme();
  const { cart } = useCart();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.action,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.border, height: 66, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ color, size }) => icon(route.name, color, Math.min(size, 22)),
        tabBarBadge: route.name === "Bag" && (cart?.itemCount ?? 0) > 0 ? cart?.itemCount : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.action, color: colors.canvas, fontSize: 10 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shop" component={ShopCategoriesScreen} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Bag" component={ShoppingBagScreen} />
      <Tab.Screen name="You" component={AccountHomeScreen} />
    </Tab.Navigator>
  );
}
