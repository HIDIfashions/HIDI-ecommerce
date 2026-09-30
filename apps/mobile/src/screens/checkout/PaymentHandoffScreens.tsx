import React from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CreditCard, Smartphone } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

/** A missing PSP bridge must not reserve stock or create an unpayable order. */
function SecureHandoff({ mode, onBack, onHelp }: { mode: "upi" | "card"; onBack: () => void; onHelp: () => void }) {
  const { colors } = useHidiTheme();
  const Icon = mode === "upi" ? Smartphone : CreditCard;
  return <HidiScreen testID={mode === "upi" ? "H053" : "H054"} contentStyle={styles.zero}>
    <AppHeader title={mode === "upi" ? "UPI handoff" : "Secure card checkout"} onBack={onBack} />
    <View style={styles.body}>
      <View style={[styles.icon, { backgroundColor: colors.blush }]}><Icon size={30} color={colors.action} /></View>
      <HidiText variant="title">Secure payment is not active yet.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Payment details belong in the approved provider's secure checkout. HIDI never asks for a UPI PIN, CVV or bank password.</HidiText>
      <MessageCard>The native payment handoff has not been connected in this internal build. No order, stock reservation or payment attempt is created from this screen.</MessageCard>
      <HidiButton label="Back to order review" onPress={onBack} />
      <AppHeader title="Payment help" onHelp={onHelp} />
    </View>
  </HidiScreen>;
}
export function UpiHandoffScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "UpiHandoff">) {
  return <SecureHandoff mode="upi" onBack={navigation.goBack} onHelp={() => navigation.navigate("ContactHidi")} />;
}
export function SecureCardCheckoutScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "SecureCardCheckout">) {
  return <SecureHandoff mode="card" onBack={navigation.goBack} onHelp={() => navigation.navigate("ContactHidi")} />;
}
const styles = StyleSheet.create({ zero: { paddingHorizontal: 0, paddingTop: 0 }, body: { padding: 22, gap: 15 }, icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" } });
