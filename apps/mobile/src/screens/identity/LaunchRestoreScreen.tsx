import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
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
      localStore.verificationRetryUntil(),
    ]).then(([seen, retryUntil]) => {
      if (!alive) return;
      if (retryUntil > Date.now()) {
        navigation.replace("VerificationLimited", { retryUntil });
        return;
      }
      navigation.replace(seen ? "MainTabs" : "Welcome");
    });
    return () => { alive = false; };
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.action }]}>
      <HidiText variant="display" style={[styles.logo, { color: colors.canvas }]}>HIDI</HidiText>
      <HidiText variant="metadata" style={{ color: colors.canvas, letterSpacing: 3 }}>EVERYDAY, BEAUTIFULLY.</HidiText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { letterSpacing: 12, marginBottom: 8 },
});
