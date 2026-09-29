import React from "react";
import { Platform, Text, TextProps } from "react-native";
import { hidiType } from "../theme/tokens";
import { useHidiTheme } from "../theme/HidiTheme";

type Variant = "display" | "title" | "body" | "secondary" | "metadata" | "action";

export function HidiText({
  children,
  variant = "body",
  style,
  ...props
}: TextProps & { variant?: Variant }) {
  const { colors } = useHidiTheme();
  const type = variant === "action" ? hidiType.secondary : hidiType[variant];
  const editorial = variant === "display" || variant === "title";

  return (
    <Text
      {...props}
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
