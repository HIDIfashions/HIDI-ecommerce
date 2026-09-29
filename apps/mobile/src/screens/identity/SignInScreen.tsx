import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { customerAuthConfigured } from "../../config/publicRuntime";
import { sendPhoneOtp } from "../../auth/session";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

export default function SignInScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setError("");
    setBusy(true);
    try {
      const activeLimit = await localStore.verificationRetryUntil();
      if (activeLimit > Date.now()) {
        navigation.replace("VerificationLimited", { retryUntil: activeLimit, phone });
        return;
      }
      const result = await sendPhoneOtp(phone);
      navigation.navigate("VerifyPhone", { ...result, returnTo: route.params?.returnTo });
    } catch (cause) {
      const err = cause as Error & { status?: number; retryAfterSeconds?: number };
      if (err.status === 429) {
        const retryUntil = Date.now() + Math.max(err.retryAfterSeconds ?? 60, 60) * 1000;
        await localStore.setVerificationRetryUntil(retryUntil);
        navigation.replace("VerificationLimited", { retryUntil, phone });
        return;
      }
      setError(err.message || "Unable to send a verification code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <HidiScreen contentStyle={styles.zeroTop}>
      <AppHeader title="Sign in" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.3 }}>YOUR DETAILS, KEPT YOURS</HidiText>
        <HidiText variant="title">Welcome to HIDI</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Sign in or join with a one-time code.</HidiText>

        <View style={{ marginTop: 18 }}>
          <HidiField
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+91 9•••• •4321"
            maxLength={14}
            error={error}
          />
        </View>

        {!customerAuthConfigured() ? (
          <MessageCard tone="error">Customer verification configuration is not available in this build.</MessageCard>
        ) : (
          <MessageCard>We’ll send a verification code only for sign-in. This does not opt you into marketing.</MessageCard>
        )}

        <HidiButton label="Send verification code" loading={busy} disabled={!customerAuthConfigured()} onPress={() => void send()} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] })}>
          <HidiText variant="action">Continue browsing</HidiText>
        </Pressable>
        <HidiText variant="metadata" style={[styles.legal, { color: colors.mutedText }]}>Optional after verification: you control analytics and promotional contact separately.</HidiText>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 14 },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  legal: { textAlign: "center" },
});
