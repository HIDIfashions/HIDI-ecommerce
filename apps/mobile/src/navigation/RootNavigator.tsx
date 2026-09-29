import React from "react";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useHidiTheme } from "../theme/HidiTheme";
import FoundationReadyScreen from "../screens/FoundationReadyScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { mode, colors } = useHidiTheme();
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
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
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="Foundation" component={FoundationReadyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
