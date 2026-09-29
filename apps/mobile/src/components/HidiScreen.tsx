import React, { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiSpacing } from "../theme/tokens";

export function HidiScreen({
  children,
  scroll = true,
  contentStyle,
  testID,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle; testID?: string }>) {
  const { colors } = useHidiTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} testID={testID}>
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: {
    paddingHorizontal: hidiSpacing.outerGutter,
    paddingTop: hidiSpacing.x6,
    paddingBottom: hidiSpacing.x12,
  },
});
