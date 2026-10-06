import React from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { CommerceProvider } from "../store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import RootNavigator from "../navigation/RootNavigator";

function Providers() {
  return (
    <CommerceProvider>
      <BottomSheetModalProvider>
        <StatusBar barStyle="dark-content" />
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
      </BottomSheetModalProvider>
    </CommerceProvider>
  );
}

export default function PremiumApp() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Providers />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
