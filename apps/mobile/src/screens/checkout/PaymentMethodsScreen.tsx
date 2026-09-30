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
  const { colors } = useHidiTheme(); const { cart } = useCart();
  return <HidiScreen testID="H052" contentStyle={styles.zero}>
    <AppHeader title="Payment methods" onBack={navigation.goBack} />
    <View style={styles.body}>
      <HidiText variant="title">Secure payment setup.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{cart ? "Current bag subtotal: " + formatINRPaise(cart.subtotalPaise) : "Bag subtotal is not available."} This is not a final payable quote.</HidiText>
      <PaymentOption icon={<Smartphone size={22} color={colors.action} />} title="UPI" detail="Native provider handoff is not active in this internal build. No order is created by opening this option." onPress={() => navigation.navigate("UpiHandoff")} />
      <PaymentOption icon={<CreditCard size={22} color={colors.action} />} title="Cards / netbanking" detail="HIDI does not collect PAN, CVV, UPI PIN or bank passwords. View the current provider-integration status." onPress={() => navigation.navigate("SecureCardCheckout")} />
      <PaymentOption icon={<IndianRupee size={22} color={colors.mutedText} />} title="Cash on delivery" detail="COD is not exposed by the current backend contract." onPress={() => navigation.navigate("CashOnDelivery")} />
      <MessageCard>New online checkout preparation is blocked until the approved native payment bridge is connected. Existing order status can still be checked; no pending payment is automatically retried.</MessageCard>
    </View>
  </HidiScreen>;
}
function PaymentOption({ icon, title, detail, onPress }: { icon: React.ReactNode; title: string; detail: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}>{icon}<View style={{ flex: 1, gap: 4 }}><HidiText variant="secondary" style={styles.bold}>{title}</HidiText><HidiText variant="secondary" style={{ color: colors.mutedText }}>{detail}</HidiText></View><HidiText variant="secondary">›</HidiText></Pressable>;
}
const styles = StyleSheet.create({ zero: { paddingHorizontal: 0, paddingTop: 0 }, body: { padding: 22, gap: 14 }, option: { minHeight: 82, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, bold: { fontWeight: "600" } });
