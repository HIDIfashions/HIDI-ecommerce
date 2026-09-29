import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Gift } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Promotions">;

export default function PromotionsScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();
  const [code, setCode] = useState("");

  return (
    <HidiScreen testID="H041" contentStyle={styles.zero}>
      <AppHeader title="Offers & promo code" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiField label="Promo code" value={code} onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))} autoCapitalize="characters" placeholder="HIDI10" />
        <HidiText variant="secondary" style={styles.bold}>Available for your bag</HidiText>
        <View style={[styles.offer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Gift size={20} color={colors.action} />
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>No server-backed promo offer is exposed</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Current bag subtotal: {formatINRPaise(cart?.subtotalPaise ?? 0)}</HidiText>
          </View>
        </View>
        <MessageCard>
          The existing cart API has no promotion endpoint, eligibility rules, expiry, exclusions or discount allocation. Phase 2 therefore never changes the payable total client-side.
        </MessageCard>
        <HidiButton label="Apply code" disabled={!code.trim()} onPress={() => navigation.navigate("PromoFailure", { code: code.trim() })} />
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
  bold: { fontWeight: "600" },
  offer: { minHeight: 80, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
