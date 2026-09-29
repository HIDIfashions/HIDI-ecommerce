import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AlertTriangle, ChevronRight } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "BagAttention">;

export default function BagAttentionScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const cart = useCart();
  const [error, setError] = useState("");

  async function acknowledge() {
    setError("");
    try {
      await cart.acknowledgeAttention();
      navigation.navigate("MainTabs", { screen: "Bag" });
    } catch {
      setError("The updated bag could not be acknowledged on this device. Please try again.");
    }
  }

  return (
    <HidiScreen testID="H043" contentStyle={styles.zero}>
      <AppHeader title="Bag needs attention" onBack={navigation.goBack} />
      <View style={styles.body}>
        <AlertTriangle size={30} color={colors.caution} />
        <HidiText variant="title">Your bag changed.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Review every change before a later checkout phase can create a fresh order quote.</HidiText>

        {cart.attention.length ? cart.attention.map((change, index) => (
          <View key={change.lineId + ":" + change.kind + ":" + index} style={[styles.change, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <HidiText variant="secondary" style={styles.bold}>{change.productName}</HidiText>
              <HidiText variant="metadata">{change.message}</HidiText>
              {change.beforePaise !== undefined && change.afterPaise !== undefined ? (
                <HidiText variant="metadata" style={{ color: colors.caution }}>{formatINRPaise(change.beforePaise)} → {formatINRPaise(change.afterPaise)}</HidiText>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" onPress={() => change.kind === "price"
              ? undefined
              : navigation.navigate(change.kind === "unavailable" ? "BagRemove" : "BagEdit", { lineId: change.lineId } as any)} style={styles.changeAction}>
              {change.kind !== "price" ? <ChevronRight size={18} color={colors.action} /> : null}
            </Pressable>
          </View>
        )) : <MessageCard>No unacknowledged bag changes remain.</MessageCard>}

        <MessageCard>Unavailable lines are never removed automatically. A price change updates no payment amount because Phase 2 creates no payment intent.</MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="I reviewed these changes" disabled={!cart.attention.length} onPress={() => void acknowledge()} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 14 },
  change: { minHeight: 76, borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  bold: { fontWeight: "600" },
  changeAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});
