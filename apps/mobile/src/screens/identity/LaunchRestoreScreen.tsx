import React, { useEffect } from "react";
import { Linking, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HidiText } from "../../components/HidiText";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Launch">;

export default function LaunchRestoreScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();

  useEffect(() => {
    let alive = true;
    void Promise.all([
      localStore.onboardingSeen(),
      localStore.verificationLimit(),
      localStore.lastSafeRoute(),
      Linking.getInitialURL().catch(() => null),
]).then(([seen, verificationLimit, lastSafeRoute, initialUrl]) => {
      if (!alive) return;
      if (verificationLimit.retryUntil > Date.now()) {
        navigation.replace("VerificationLimited", { retryUntil: verificationLimit.retryUntil, phone: verificationLimit.phone || undefined });
        return;
      }
      const webProduct = initialUrl?.match(/\/products\/([^/?#]+)/i)?.[1];
      const appProduct = initialUrl?.match(/^hidi:\/\/products\/([^/?#]+)/i)?.[1];
      const deepProduct = webProduct ?? appProduct;
      if (deepProduct) {
        navigation.replace("ProductDeferred", { slug: decodeURIComponent(deepProduct) });
        return;
      }
      if (seen && lastSafeRoute?.startsWith("product:")) {
        navigation.replace("ProductDeferred", { slug: lastSafeRoute.slice("product:".length) });
        return;
      }
      navigation.replace(seen ? "MainTabs" : "Welcome");
    });
    return () => { alive = false; };
  }, [navigation]);

  return (
    <View testID="H001" style={[styles.root, { backgroundColor: colors.action }]}>
      <HidiText variant="display" style={[styles.logo, { color: colors.canvas }]}>HIDI</HidiText>
      <HidiText variant="metadata" style={{ color: colors.canvas, letterSpacing: 3 }}>EVERYDAY, BEAUTIFULLY.</HidiText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { letterSpacing: 12, marginBottom: 8 },
});
