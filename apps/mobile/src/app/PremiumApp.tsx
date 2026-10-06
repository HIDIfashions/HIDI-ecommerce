import React from "react";
import { StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StripeProvider } from "@stripe/stripe-react-native";
import { CommerceProvider } from "../store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import RootNavigator from "../navigation/RootNavigator";
import { appleMerchantId, stripePublishableKey } from "../config";

function Providers() {
  return <CommerceProvider><BottomSheetModalProvider><StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" /><ErrorBoundary><RootNavigator /></ErrorBoundary></BottomSheetModalProvider></CommerceProvider>;
}

export default function PremiumApp() {
  const app = <Providers />;
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider>{stripePublishableKey ? <StripeProvider publishableKey={stripePublishableKey} merchantIdentifier={appleMerchantId}>{app}</StripeProvider> : app}</SafeAreaProvider></GestureHandlerRootView>;
}
