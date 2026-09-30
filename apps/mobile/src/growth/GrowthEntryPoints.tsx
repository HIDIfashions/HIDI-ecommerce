import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { HidiText } from "../components/HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { featureAvailable, GrowthFeature } from "./contracts";
import { useGrowthRuntime } from "./runtime";

export function GrowthEntryPoints({ area, onOpen }: { area: "account" | "bag"; onOpen: (feature: GrowthFeature) => void }) {
  const runtime = useGrowthRuntime(); const { colors } = useHidiTheme();
  const candidates: GrowthFeature[] = area === "account" ? ["circle", "referrals"] : ["gifting"];
  const visible = candidates.filter(f => featureAvailable(f, runtime.flags, runtime.capabilities));
  // Off flags remove the complete entry surface; no teaser, network or blank gap.
  if (!visible.length) return null;
  const labels = { circle: "HIDI Circle", referrals: "Invite a friend", gifting: "Gift note & packaging" };
  return <View style={[styles.group, { backgroundColor: colors.canvas }]}>
    {visible.map(feature => <Pressable key={feature} testID={"growth-entry-" + feature} accessibilityRole="button" onPress={() => onOpen(feature)} style={[styles.row, { borderTopColor: colors.border }]}>
      <HidiText variant="secondary" style={{ color: colors.action }}>{labels[feature]}</HidiText>
      <HidiText variant="secondary" style={{ color: colors.action }}>›</HidiText>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({ group: { paddingHorizontal: 20 }, row: { minHeight: 52, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 } });
