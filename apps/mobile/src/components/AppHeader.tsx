import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowLeft, CircleHelp } from "lucide-react-native";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiAccessibility, hidiSpacing } from "../theme/tokens";

export function AppHeader({
  title,
  onBack,
  onHelp,
}: {
  title: string;
  onBack?: () => void;
  onHelp?: () => void;
}) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={onBack} style={styles.icon}>
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      <HidiText variant="secondary" style={styles.title}>{title}</HidiText>
      <View style={[styles.side, styles.right]}>
        {onHelp ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Help" hitSlop={8} onPress={onHelp} style={styles.icon}>
            <CircleHelp size={20} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: hidiSpacing.x2,
  },
  side: { width: 56, minHeight: hidiAccessibility.minTouchTarget, justifyContent: "center" },
  right: { alignItems: "flex-end" },
  icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontWeight: "600" },
});
