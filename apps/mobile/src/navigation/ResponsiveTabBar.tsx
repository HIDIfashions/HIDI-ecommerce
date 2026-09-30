import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Grid2X2, Heart, House, ShoppingBag, UserRound } from "lucide-react-native";
import { useHidiTheme } from "../theme/HidiTheme";

/** At large text sizes, two rows preserve all five labels instead of truncating them. */
export function ResponsiveTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useHidiTheme();
  const { width, fontScale } = useWindowDimensions();
  const expanded = fontScale >= 1.6 && width < 500;
  const basis = expanded ? "33.333333%" : "20%";
  return <View testID="hidi-tab-bar" style={[styles.bar, { backgroundColor: colors.canvas, borderTopColor: colors.border, paddingBottom: Math.max(8, insets.bottom) }]}>
    {state.routes.map((route, index) => {
      const selected = state.index === index;
      const options = descriptors[route.key]?.options;
      const badge = options?.tabBarBadge;
      const Icon = route.name === "Home" ? House : route.name === "Shop" ? Grid2X2 : route.name === "Saved" ? Heart : route.name === "Bag" ? ShoppingBag : UserRound;
      const color = selected ? colors.action : colors.mutedText;
      const label = typeof options?.tabBarLabel === "string" ? options.tabBarLabel : route.name;
      const onPress = () => {
        const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      };
      return <Pressable key={route.key} testID={"tab-" + route.name.toLowerCase()} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label + (badge !== undefined ? ", " + badge + " items" : "")} onPress={onPress} onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })} style={[styles.item, { flexBasis: basis, minHeight: expanded ? 74 : 58 }]}>
        <View style={styles.icon}><Icon size={22} color={color} />{badge !== undefined ? <View style={[styles.badge, { backgroundColor: colors.action }]}><Text allowFontScaling style={[styles.badgeText, { color: colors.canvas }]}>{badge}</Text></View> : null}</View>
        <Text allowFontScaling maxFontSizeMultiplier={2} style={[styles.label, { color }]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 5 },
  item: { alignItems: "center", justifyContent: "center", paddingHorizontal: 3, paddingVertical: 6, gap: 3 },
  icon: { width: 26, height: 25, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, lineHeight: 16, textAlign: "center", flexShrink: 1 },
  badge: { position: "absolute", left: 17, top: -5, minWidth: 17, minHeight: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 10, lineHeight: 13 },
});
