import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Clock3 } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "VerificationLimited">;

export default function VerificationLimitedScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.ceil((route.params.retryUntil - now) / 1000));
  const label = useMemo(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return String(minutes) + ":" + String(seconds).padStart(2, "0");
  }, [remaining]);

  async function changeNumber() {
    if (remaining <= 0) await localStore.setVerificationRetryUntil(0);
    navigation.replace("SignIn");
  }

  return (
    <HidiScreen testID="H008" contentStyle={styles.zeroTop}>
      <AppHeader title="Verification limited" onBack={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] })} />
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.blush }]}>
          <Clock3 size={30} color={colors.action} />
        </View>
        <HidiText variant="title" style={styles.center}>Verification is temporarily limited.</HidiText>
        <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>
          Too many verification attempts were made. Please try again in {label}, or use another number.
        </HidiText>
        <Pressable accessibilityRole="button" onPress={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] })} style={styles.guest}>
          <HidiText variant="secondary" style={{ color: colors.action }}>You can still explore as a guest</HidiText>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://thehidi.com/contact")} style={styles.guest}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Get HIDI support</HidiText>
        </Pressable>
        <HidiButton label="Change number" onPress={() => void changeNumber()} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 72, gap: 18, alignItems: "center" },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  guest: { minHeight: 48, justifyContent: "center" },
});
