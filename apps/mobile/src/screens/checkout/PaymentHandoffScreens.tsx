import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CreditCard, Smartphone } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useAuth } from "../../auth/AuthContext";
import { useCart } from "../../data/CartContext";
import { createCheckoutAttempt } from "../../data/checkoutApi";
import type { CheckoutAddress, CheckoutContact } from "../../models/checkout";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type UpiProps = NativeStackScreenProps<RootStackParamList, "UpiHandoff">;
type CardProps = NativeStackScreenProps<RootStackParamList, "SecureCardCheckout">;
type CheckoutNavigation = {
  goBack: () => void;
  replace: (name: keyof RootStackParamList, params?: object) => void;
};

function SecureHandoff({ navigation, mode }: { navigation: CheckoutNavigation; mode: "upi" | "card" }) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const { cart } = useCart();
  const [contact, setContact] = useState<CheckoutContact | null>(null);
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([checkoutStorage.contact(), checkoutStorage.selectedAddress()]).then(([c, a]) => { setContact(c); setAddress(a); });
  }, []);

  async function start() {
    if (!cart || !contact || !address) {
      setError("Checkout details are incomplete. Review the order again.");
      return;
    }
    setBusy(true); setError("");
    try {
      const attempt = await createCheckoutAttempt({ cart, contact, address, accessToken: auth.session?.access_token, methodIntent: mode });
      if (attempt.captured) navigation.replace("OrderConfirmed", { orderNumber: attempt.orderNumber });
      else navigation.replace("ConfirmingPayment", { orderNumber: attempt.orderNumber });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Secure payment could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "upi" ? "UPI handoff" : "Secure card checkout";
  const Icon = mode === "upi" ? Smartphone : CreditCard;
  return (
    <HidiScreen testID={mode === "upi" ? "H053" : "H054"} contentStyle={styles.zero}>
      <AppHeader title={title} onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Icon size={30} color={colors.action} /></View>
        <HidiText variant="title">Leave HIDI securely.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>
          {mode === "upi" ? "The approved provider should list eligible UPI apps. HIDI never asks for your UPI PIN." : "Card or netbanking details belong in the provider-owned surface, not a HIDI form."}
        </HidiText>
        <MessageCard>
          Current mobile frontend has no native Razorpay SDK bridge. Starting here creates/reuses one server checkout attempt and order reference, then keeps the result pending until provider reconciliation confirms it.
        </MessageCard>
        {cart ? <MessageCard>Amount sent to the backend: {formatINRPaise(cart.subtotalPaise)}. Client-side arithmetic is not authoritative.</MessageCard> : null}
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label={busy ? "Preparing secure attempt…" : mode === "upi" ? "Prepare UPI payment" : "Prepare secure payment"} loading={busy} onPress={() => void start()} />
      </View>
    </HidiScreen>
  );
}

export function UpiHandoffScreen({ navigation }: UpiProps) {
  return <SecureHandoff navigation={navigation} mode="upi" />;
}

export function SecureCardCheckoutScreen({ navigation }: CardProps) {
  return <SecureHandoff navigation={navigation} mode="card" />;
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
});