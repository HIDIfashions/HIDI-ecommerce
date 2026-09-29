import React, { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../theme/tokens";

export function MessageCard({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "error" | "success" }>) {
  const { colors } = useHidiTheme();
  const borderColor = tone === "error" ? colors.error : tone === "success" ? colors.success : colors.border;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor }]}>
      {typeof children === "string" ? <HidiText variant="secondary">{children}</HidiText> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: hidiRadius.control,
    padding: hidiSpacing.x4,
  },
});
