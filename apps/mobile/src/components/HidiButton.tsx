import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, ViewStyle } from "react-native";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiAccessibility, hidiRadius, hidiSpacing } from "../theme/tokens";

export function HidiButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useHidiTheme();
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colors.action,
          opacity: unavailable ? 0.45 : pressed ? 0.86 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.canvas} /> : null}
      <HidiText variant="action" style={{ color: colors.canvas }}>
        {label}
      </HidiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: hidiAccessibility.minTouchTarget,
    borderRadius: hidiRadius.control,
    paddingHorizontal: hidiSpacing.x5,
    paddingVertical: hidiSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: hidiSpacing.x2,
  },
});
