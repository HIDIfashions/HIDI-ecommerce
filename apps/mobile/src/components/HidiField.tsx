import React from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../theme/tokens";

export function HidiField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.wrap}>
      <HidiText variant="metadata" style={styles.label}>{label}</HidiText>
      <TextInput
        {...props}
        allowFontScaling
        placeholderTextColor={colors.mutedText}
        selectionColor={colors.action}
        style={[
          styles.input,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : colors.border,
          },
          props.style,
        ]}
      />
      {error ? <HidiText variant="metadata" style={{ color: colors.error }}>{error}</HidiText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: hidiSpacing.x2 },
  label: { fontWeight: "600" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: hidiRadius.control,
    paddingHorizontal: hidiSpacing.x4,
    paddingVertical: hidiSpacing.x3,
    fontSize: 16,
  },
});
