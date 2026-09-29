import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CreditCard, IndianRupee, Smartphone } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PaymentMethods">;

export default function PaymentMethodsScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();
  const amount = cart?.subtotalPaise ?? 0;
  return (
    <HidiScreen testID="H052" contentStyle={styles.zero}>
      <AppHeader title="Payment methods" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Choose how to pay.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Payable amount: {formatINRPaise(amount)}. No hidden handling fee is added in the app.</HidiText>
        <PaymentOption icon={<Smartphone size={22} color={colors.action} />} title="UPI through secure provider" detail="Creates one server checkout attempt, then hands off to the approved provider integration." onPress={() => navigation.navigate("UpiHandoff")} />
        <PaymentOption icon={<CreditCard size={22} color={colors.action} />} title="Cards / netbanking through secure provider" detail="HIDI never asks for PAN, CVV, UPI PIN or bank password in its own UI." onPress={() => navigation.navigate("SecureCardCheckout")} />
        <PaymentOption icon={<IndianRupee size={22} color={colors.mutedText} />} title="Cash on delivery" detail="COD is not exposed by the current backend contract." onPress={() => navigation.navigate("CashOnDelivery")} muted />
        <MessageCard>Each online attempt reuses the saved checkout token. If an order is already pending, the backend returns that same reference instead of creating a second charge.</MessageCard>
      </View>
    </HidiScreen>
  );
}

function PaymentOption({ icon, title, detail, onPress, muted }: { icon: React.ReactNode; title: string; detail: string; onPress: () => void; muted?: boolean }) {
  const { colors } = useHidiTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface, opacity: muted ? 0.7 : 1 }]}> 
      {icon}
      <View style={{ flex: 1, gap: 4 }}>
        <HidiText variant="secondary" style={styles.bold}>{title}</HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>{detail}</HidiText>
      </View>
      <HidiText variant="secondary">›</HidiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 14 },
  option: { minHeight: 82, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  bold: { fontWeight: "600" },
});
