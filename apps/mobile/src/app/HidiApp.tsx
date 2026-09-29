import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import RootNavigator from "../navigation/RootNavigator";
import { HidiThemeProvider, useHidiTheme } from "../theme/HidiTheme";
import { AuthProvider } from "../auth/AuthContext";
import { CatalogProvider } from "../data/CatalogContext";
import { CartProvider } from "../data/CartContext";

enableScreens(true);

function AppChrome() {
  const { mode } = useHidiTheme();

  return (
    <>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <RootNavigator />
    </>
  );
}

export default function HidiApp() {
  return (
    <SafeAreaProvider>
      <HidiThemeProvider>
        <AuthProvider>
          <CatalogProvider>
            <CartProvider>
              <AppChrome />
            </CartProvider>
          </CatalogProvider>
        </AuthProvider>
      </HidiThemeProvider>
    </SafeAreaProvider>
  );
}
