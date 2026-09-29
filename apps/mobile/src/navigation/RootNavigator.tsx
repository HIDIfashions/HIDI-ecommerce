import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Linking } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useHidiTheme } from "../theme/HidiTheme";
import type { RootStackParamList } from "./types";
import MainTabs from "./MainTabs";
import LaunchRestoreScreen from "../screens/identity/LaunchRestoreScreen";
import WelcomeScreen from "../screens/identity/WelcomeScreen";
import StylePreferencesScreen from "../screens/identity/StylePreferencesScreen";
import SignInScreen from "../screens/identity/SignInScreen";
import VerifyPhoneScreen from "../screens/identity/VerifyPhoneScreen";
import CompleteProfileScreen from "../screens/identity/CompleteProfileScreen";
import ConsentPreferencesScreen from "../screens/identity/ConsentPreferencesScreen";
import VerificationLimitedScreen from "../screens/identity/VerificationLimitedScreen";
import CollectionLandingScreen from "../screens/discover/CollectionLandingScreen";
import ListingScreen from "../screens/discover/ListingScreen";
import SearchScreen from "../screens/discover/SearchScreen";
import SearchResultsScreen from "../screens/discover/SearchResultsScreen";
import RecentlyViewedScreen from "../screens/discover/RecentlyViewedScreen";
import DeferredProductScreen from "../screens/discover/DeferredProductScreen";
import { parseHidiDeepLink } from "./deepLinks";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { mode, colors } = useHidiTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const base = mode === "dark" ? DarkTheme : DefaultTheme;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const target = parseHidiDeepLink(url);
      if (!target || !navigationRef.isReady()) return;
      if (target.type === "product") {
        navigationRef.navigate("ProductDeferred", { slug: target.slug });
      } else {
        navigationRef.navigate("Collection", { slug: target.slug, title: target.title });
      }
    });
    return () => subscription.remove();
  }, [navigationRef]);

  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.action,
      background: colors.canvas,
      card: colors.surface,
      text: colors.ink,
      border: colors.border,
      notification: colors.error,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Launch"
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? "fade" : "slide_from_right",
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="Launch" component={LaunchRestoreScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="StylePreferences" component={StylePreferencesScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="VerifyPhone" component={VerifyPhoneScreen} />
        <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
        <Stack.Screen name="ConsentPreferences" component={ConsentPreferencesScreen} />
        <Stack.Screen name="VerificationLimited" component={VerificationLimitedScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: "fade" }} />
        <Stack.Screen name="Collection" component={CollectionLandingScreen} />
        <Stack.Screen name="Listing" component={ListingScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen name="RecentlyViewed" component={RecentlyViewedScreen} />
        <Stack.Screen name="ProductDeferred" component={DeferredProductScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
