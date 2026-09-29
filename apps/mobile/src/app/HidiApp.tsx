import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import RootNavigator from "../navigation/RootNavigator";
import { HidiThemeProvider, useHidiTheme } from "../theme/HidiTheme";

enableScreens(true);

function AppChrome() {
  const { mode, colors } = useHidiTheme();

  return (
    <>
      <StatusBar
        backgroundColor={colors.canvas}
        barStyle={mode === "dark" ? "light-content" : "dark-content"}
      />
      <RootNavigator />
    </>
  );
}

export default function HidiApp() {
  return (
    <SafeAreaProvider>
      <HidiThemeProvider>
        <AppChrome />
      </HidiThemeProvider>
    </SafeAreaProvider>
  );
}
