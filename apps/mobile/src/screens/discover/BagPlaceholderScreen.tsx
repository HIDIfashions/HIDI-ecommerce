import React from "react";
import { View, StyleSheet } from "react-native";
import { ShoppingBag } from "lucide-react-native";
import { HidiText } from "../../components/HidiText";
import { useHidiTheme } from "../../theme/HidiTheme";

export default function BagPlaceholderScreen() {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ShoppingBag size={32} color={colors.action} />
      <HidiText variant="title" style={styles.center}>Your bag</HidiText>
      <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>
        Bag editing and checkout-safe quantity flows are implemented in Phase 2.
      </HidiText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  center: { textAlign: "center" },
});
