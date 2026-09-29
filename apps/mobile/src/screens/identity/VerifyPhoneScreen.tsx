import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { maskPhone, sendPhoneOtp, verifyPhoneOtp } from "../../auth/session";
import { useAuth } from "../../auth/AuthContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import { localStore } from "../../storage/localStore";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "VerifyPhone">;

export default function VerifyPhoneScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(route.params.resendAfterSeconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  async function verify() {
    setBusy(true); setError("");
    try {
      const session = await verifyPhoneOtp(route.params.phone, code);
      auth.setSession(session);
      const name = typeof session.user.user_metadata?.first_name === "string" ? String(session.user.user_metadata?.first_name).trim() : "";
      if (!name) navigation.replace("CompleteProfile", { returnTo: route.params.returnTo });
      else navigation.reset({
        index: 0,
        routes: [{ name: "MainTabs", params: route.params.returnTo === "saved" ? { screen: "Saved" } : { screen: "Home" } }],
      });
    } catch (cause) {
      const err = cause as Error & { status?: number; retryAfterSeconds?: number };
      if (err.status === 429) {
        const retryUntil = Date.now() + Math.max(err.retryAfterSeconds ?? 60, 60) * 1000;
        await localStore.setVerificationLimit(route.params.phone, retryUntil);
        navigation.replace("VerificationLimited", { retryUntil, phone: route.params.phone });
        return;
      }
      setError(err.message || "Unable to verify the code.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    try {
      const result = await sendPhoneOtp(route.params.phone);
      setSeconds(result.resendAfterSeconds);
      setCode("");
    } catch (cause) {
      const err = cause as Error & { status?: number; retryAfterSeconds?: number };
      if (err.status === 429) {
        const retryUntil = Date.now() + Math.max(err.retryAfterSeconds ?? 60, 60) * 1000;
        await localStore.setVerificationLimit(route.params.phone, retryUntil);
        navigation.replace("VerificationLimited", { retryUntil, phone: route.params.phone });
        return;
      }
      setError(err.message || "Unable to resend right now.");
    }
  }

  return (
    <HidiScreen testID="H005" contentStyle={styles.zeroTop}>
      <AppHeader title="Verify phone" onBack={navigation.goBack} />
      <Pressable style={styles.body} onPress={() => inputRef.current?.focus()}>
        <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.3 }}>WHATSAPP VERIFICATION</HidiText>
        <HidiText variant="title">Check WhatsApp.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Enter the 6-digit code we sent on WhatsApp to {maskPhone(route.params.phone)}.</HidiText>

        <Pressable accessibilityRole="button" onPress={() => navigation.replace("SignIn", { returnTo: route.params.returnTo })}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Change number</HidiText>
        </Pressable>

        <View style={styles.codeRow}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={[styles.codeBox, { borderColor: index === code.length ? colors.action : colors.border, backgroundColor: colors.surface }]}>
              <HidiText variant="title">{code[index] ?? ""}</HidiText>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          style={styles.hiddenInput}
          accessibilityLabel="6-digit verification code"
          autoFocus
        />

        <HidiText variant="metadata" style={{ color: colors.mutedText }}>
          {seconds > 0 ? "Resend code in 0:" + String(seconds).padStart(2, "0") : "You can request another code now."}
        </HidiText>
        {seconds <= 0 ? (
          <Pressable accessibilityRole="button" style={styles.resend} onPress={() => void resend()}>
            <HidiText variant="action" style={{ color: colors.action }}>Resend on WhatsApp</HidiText>
          </Pressable>
        ) : null}

        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <MessageCard>Keep this code private. HIDI support will never ask you to share it.</MessageCard>
        <HidiButton label="Verify & continue" loading={busy} disabled={code.length !== 6} onPress={() => void verify()} />
      </Pressable>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 14 },
  codeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  codeBox: { flex: 1, aspectRatio: 0.85, minHeight: 54, borderWidth: 1, borderRadius: hidiRadius.control, alignItems: "center", justifyContent: "center" },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  resend: { minHeight: 48, justifyContent: "center" },
});
