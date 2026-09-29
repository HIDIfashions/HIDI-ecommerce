import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Mail, ShieldCheck } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { updateProfile } from "../../auth/session";
import { useAuth } from "../../auth/AuthContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CompleteProfile">;

export default function CompleteProfileScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Enter the name you’d like HIDI to use."); return; }
    setBusy(true); setError("");
    try {
      const session = await updateProfile({ preferredName: name, email: email.trim() || undefined });
      auth.setSession(session);
      navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <HidiScreen contentStyle={styles.zeroTop}>
      <AppHeader title="Complete profile" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Make yourself at home.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Just the details that make shopping easier.</HidiText>
        <HidiField label="Preferred name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Ananya" />
        <HidiField label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="ananya@example.com" />

        <MessageCard>
          <View style={styles.info}>
            <ShieldCheck size={18} color={colors.action} />
            <HidiText variant="metadata" style={{ flex: 1 }}>Your verified mobile remains the sign-in identity for this session.</HidiText>
          </View>
        </MessageCard>
        <MessageCard>
          <View style={styles.info}>
            <Mail size={18} color={colors.action} />
            <HidiText variant="metadata" style={{ flex: 1 }}>If you add an email, the identity provider may ask you to verify it before it becomes active.</HidiText>
          </View>
        </MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Save profile" loading={busy} onPress={() => void save()} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] })}>
          <HidiText variant="action">Not now</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 14 },
  info: { flexDirection: "row", gap: 10, alignItems: "center" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
