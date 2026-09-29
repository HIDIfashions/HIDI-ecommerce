import React from "react";
import { StyleSheet, View } from "react-native";
import { HidiButton } from "../components/HidiButton";
import { HidiScreen } from "../components/HidiScreen";
import { HidiText } from "../components/HidiText";
import { HIDI_GATEWAY_BASE_URL } from "../network/config";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../theme/tokens";

export default function FoundationReadyScreen() {
  const { colors } = useHidiTheme();

  return (
    <HidiScreen>
      <View style={styles.wordmark}>
        <HidiText variant="display" accessibilityRole="header" style={styles.brand}>
          HIDI
        </HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>
          EVERYDAY, BEAUTIFULLY.
        </HidiText>
      </View>

      <HidiText variant="title" accessibilityRole="header">
        Mobile foundation is ready.
      </HidiText>
      <HidiText style={[styles.body, { color: colors.mutedText }]}>
        The new HIDI app is isolated on this branch with React Native, native Android and iOS projects,
        blueprint design tokens, recovery state contracts and H001-H132 traceability.
      </HidiText>

      <View style={[styles.card, { backgroundColor: colors.blush, borderColor: colors.border }]}>
        <HidiText variant="secondary">React Native 0.87.1</HidiText>
        <HidiText variant="secondary">Android application: com.thehidi.app</HidiText>
        <HidiText variant="secondary">iOS bundle: com.thehidi.app</HidiText>
        <HidiText variant="secondary">Gateway: {HIDI_GATEWAY_BASE_URL}</HidiText>
      </View>

      <HidiButton label="Phase 1 starts after approval" disabled onPress={() => undefined} />
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  wordmark: { marginBottom: hidiSpacing.x10 },
  brand: { letterSpacing: 8 },
  body: { marginTop: hidiSpacing.x3, marginBottom: hidiSpacing.x6 },
  card: {
    borderWidth: 1,
    borderRadius: hidiRadius.card,
    padding: hidiSpacing.x4,
    gap: hidiSpacing.x2,
    marginBottom: hidiSpacing.x6,
  },
});
