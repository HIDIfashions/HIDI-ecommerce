import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PromoFailure">;

export default function PromoFailureScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();

  return (
    <HidiScreen testID="H042" contentStyle={styles.zero}>
      <AppHeader title="Promo code not applied" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>Promo code</HidiText>
        <View style={[styles.code, { borderColor: colors.error, backgroundColor: colors.surface }]}>
          <HidiText variant="secondary">{route.params.code}</HidiText>
        </View>
        <MessageCard tone="error">
          This code was not applied because the current HIDI cart API does not expose promotion validation or discount calculation. This is a capability state, not a claim that the code is expired or ineligible.
        </MessageCard>
        <View style={styles.totalRow}><HidiText variant="secondary">Bag subtotal remains</HidiText><HidiText variant="secondary" style={styles.bold}>{formatINRPaise(cart?.subtotalPaise ?? 0)}</HidiText></View>
        <HidiButton label="Try another code" onPress={() => navigation.replace("Promotions")} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Continue without a code</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  code: { minHeight: 52, borderWidth: 1, borderRadius: 8, justifyContent: "center", paddingHorizontal: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  bold: { fontWeight: "600" },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center" },
});
