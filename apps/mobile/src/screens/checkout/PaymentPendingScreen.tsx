import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Clock3 } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { classifySavedAttempt } from "../../data/checkoutApi";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PaymentPending">;

export default function PaymentPendingScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Date | null>(null);
  const [message, setMessage] = useState(route.params.reason ?? "Payment result is not confirmed yet.");

  async function check() {
    setBusy(true);
    try {
      const attempt = await checkoutStorage.attempt();
      if (!attempt) { setMessage("No saved payment attempt is available on this device. Contact support with your order reference."); return; }
      const result = await classifySavedAttempt(attempt);
      setLast(new Date());
      if (result.state === "confirmed") navigation.replace("OrderConfirmed", { orderNumber: attempt.orderNumber });
      else if (result.state === "failed") navigation.replace("PaymentFailed", { orderNumber: attempt.orderNumber, reason: result.confirmation.payment?.status ?? result.confirmation.status });
      else setMessage("Still pending. Please avoid paying again until HIDI receives a final provider result.");
    } catch (cause) {
      setLast(new Date());
      setMessage(cause instanceof Error ? cause.message : "Unable to check payment status right now.");
    } finally { setBusy(false); }
  }

  return (
    <HidiScreen testID="H057" contentStyle={styles.zero}>
      <AppHeader title="Payment pending" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Clock3 size={30} color={colors.action} /></View>
        <HidiText variant="title">Payment is pending.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Order reference {route.params.orderNumber}. This is not a failure and not a success yet.</HidiText>
        <MessageCard>{message}</MessageCard>
        {last ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>Last checked {last.toLocaleTimeString()}</HidiText> : null}
        <HidiButton label={busy ? "Checking…" : "Check payment status"} loading={busy} onPress={() => void check()} />
        <Pressable accessibilityRole="link" style={styles.secondary} onPress={() => void Linking.openURL("https://thehidi.com/contact")}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Contact HIDI support</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16, alignItems: "center" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, justifyContent: "center" },
});
