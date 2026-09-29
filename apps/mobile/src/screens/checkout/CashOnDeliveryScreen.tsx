import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { IndianRupee } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CashOnDelivery">;

export default function CashOnDeliveryScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();
  return (
    <HidiScreen testID="H055" contentStyle={styles.zero}>
      <AppHeader title="Cash on delivery" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><IndianRupee size={30} color={colors.action} /></View>
        <HidiText variant="title">COD is not available in this build.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Your current payable amount would be {formatINRPaise(cart?.subtotalPaise ?? 0)}, but the existing backend exposes no COD order endpoint or COD eligibility decision.</HidiText>
        <MessageCard>No unpaid COD order is created here. Confirmation must mean an accepted unpaid COD order, and that server contract is not currently present.</MessageCard>
        <HidiButton label="Choose another payment method" onPress={() => navigation.replace("PaymentMethods")} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("ReviewOrder")}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Back to review order</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
