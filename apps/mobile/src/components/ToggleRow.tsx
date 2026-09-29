import React from "react";
import { StyleSheet, Switch, View } from "react-native";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiSpacing } from "../theme/tokens";

export function ToggleRow({
  title,
  detail,
  value,
  onValueChange,
  disabled,
  fixedLabel,
}: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  fixedLabel?: string;
}) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.copy}>
        <HidiText variant="secondary" style={styles.title}>{title}</HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>{detail}</HidiText>
      </View>
      {fixedLabel ? (
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>{fixedLabel}</HidiText>
      ) : (
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.blush }}
          thumbColor={value ? colors.action : colors.surface}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: hidiSpacing.x4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: hidiSpacing.x3,
  },
  copy: { flex: 1, gap: hidiSpacing.x1 },
  title: { fontWeight: "600" },
});
