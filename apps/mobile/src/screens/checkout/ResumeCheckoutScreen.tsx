import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RotateCcw } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton } from "../../components/StateViews";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { classifySavedAttempt } from "../../data/checkoutApi";
import { useCart } from "../../data/CartContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { CheckoutResumeState } from "../../models/checkout";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ResumeCheckout">;

export default function ResumeCheckoutScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const cart = useCart();
  const [state, setState] = useState<CheckoutResumeState | null>(null);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setChecking(true); setMessage("");
    const [contact, address, delivery, attempt] = await Promise.all([
      checkoutStorage.contact(), checkoutStorage.selectedAddress(), checkoutStorage.delivery(), checkoutStorage.attempt(),
    ]);
    setState({ contact, address, delivery, attempt });
    if (attempt) {
      try {
        const result = await classifySavedAttempt(attempt);
        if (result.state === "confirmed") { navigation.replace("OrderConfirmed", { orderNumber: attempt.orderNumber }); return; }
        if (result.state === "pending") { navigation.replace("PaymentPending", { orderNumber: attempt.orderNumber, reason: "A saved payment attempt is still pending." }); return; }
        if (result.state === "failed") { navigation.replace("PaymentFailed", { orderNumber: attempt.orderNumber, reason: result.confirmation.payment?.status ?? result.confirmation.status }); return; }
      } catch {
        setMessage("Saved payment attempt could not be reconciled yet. You can still review checkout details safely.");
      }
    }
    setChecking(false);
  }

  useEffect(() => { void load(); }, []);
  if (checking && !state) return <HidiScreen><CatalogSkeleton /></HidiScreen>;

  function continueCheckout() {
    if (!cart.cart || !cart.cart.items.length) { navigation.navigate("MainTabs", { screen: "Bag" }); return; }
    if (!state?.contact) { navigation.navigate("CheckoutContact"); return; }
    if (!state.address) { navigation.navigate("CheckoutAddress"); return; }
    if (!state.delivery) { navigation.navigate("DeliveryOptions"); return; }
    navigation.navigate("ReviewOrder");
  }

  return (
    <HidiScreen testID="H060" contentStyle={styles.zero}>
      <AppHeader title="Resume checkout" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><RotateCcw size={30} color={colors.action} /></View>
        <HidiText variant="title">Resume safely.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>HIDI restores only safe checkout details and rechecks mutable bag, address and delivery data before showing a payment action.</HidiText>
        {message ? <MessageCard tone="error">{message}</MessageCard> : null}
        <MessageCard>
          Contact: {state?.contact ? "saved" : "needed"}{"\n"}
          Address: {state?.address ? "saved" : "needed"}{"\n"}
          Delivery: {state?.delivery ? "checked" : "must be rechecked"}{"\n"}
          Bag: {cart.cart?.items.length ? String(cart.cart.itemCount) + " item(s)" : "empty or loading"}
        </MessageCard>
        <HidiButton label="Continue checkout" onPress={continueCheckout} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16, alignItems: "center" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
});
