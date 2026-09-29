import React, { PropsWithChildren } from "react";
import { Platform, StyleProp, Text, TextStyle } from "react-native";
import { hidiType } from "../theme/tokens";
import { useHidiTheme } from "../theme/HidiTheme";

type Variant = "display" | "title" | "body" | "secondary" | "metadata" | "action";

export function HidiText({
  children,
  variant = "body",
  style,
  accessibilityRole,
}: PropsWithChildren<{
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: "header" | "text";
}>) {
  const { colors } = useHidiTheme();
  const type = variant === "action" ? hidiType.secondary : hidiType[variant];
  const editorial = variant === "display" || variant === "title";

  return (
    <Text
      accessibilityRole={accessibilityRole}
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[
        {
          color: colors.ink,
          fontFamily: editorial ? Platform.select({ ios: "Georgia", android: "serif" }) : undefined,
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          fontWeight: variant === "action" ? "600" : "400",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
