import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { classifySavedAttempt } from "../../data/checkoutApi";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ConfirmingPayment">;

export default function ConfirmingPaymentScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true); setMessage("");
    try {
      const attempt = await checkoutStorage.attempt();
      if (!attempt || attempt.orderNumber !== route.params.orderNumber) {
        navigation.replace("PaymentPending", { orderNumber: route.params.orderNumber, reason: "Payment reference is saved on another session or was cleared." });
        return;
      }
      const result = await classifySavedAttempt(attempt);
      setLastCheck(new Date());
      if (result.state === "confirmed") navigation.replace("OrderConfirmed", { orderNumber: attempt.orderNumber });
      else if (result.state === "failed") navigation.replace("PaymentFailed", { orderNumber: attempt.orderNumber, reason: result.confirmation.payment?.status ?? result.confirmation.status });
      else navigation.replace("PaymentPending", { orderNumber: attempt.orderNumber, reason: "Provider reconciliation has not produced a final state yet." });
    } catch (cause) {
      setLastCheck(new Date());
      setMessage(cause instanceof Error ? cause.message : "Payment status could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { const timer = setTimeout(() => void check(), 800); return () => clearTimeout(timer); }, []);

  return (
    <HidiScreen testID="H056" contentStyle={styles.zero}>
      <AppHeader title="Confirming payment" onBack={navigation.goBack} />
      <View style={styles.body}>
        <ActivityIndicator color={colors.action} size="large" />
        <HidiText variant="title" style={styles.center}>Checking with HIDI.</HidiText>
        <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>Order reference {route.params.orderNumber}. You can leave safely; do not pay again until this attempt is final.</HidiText>
        <MessageCard>Returning from an external app is only a signal. HIDI treats the server/provider reconciliation state as authoritative.</MessageCard>
        {lastCheck ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>Last checked {lastCheck.toLocaleTimeString()}</HidiText> : null}
        {message ? <MessageCard tone="error">{message}</MessageCard> : null}
        <HidiButton label={busy ? "Checking…" : "Check status"} loading={busy} onPress={() => void check()} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("PaymentPending", { orderNumber: route.params.orderNumber, reason: "You left confirmation before a final result." })}>
          <HidiText variant="metadata" style={{ color: colors.action }}>I’ll check later</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { flex: 1, padding: 24, gap: 16, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  secondary: { minHeight: 48, justifyContent: "center" },
});
