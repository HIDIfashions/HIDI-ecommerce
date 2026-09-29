import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Phone } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useAuth } from "../../auth/AuthContext";
import { normalizeCheckoutPhone } from "../../models/checkout";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CheckoutContact">;

export default function GuestCheckoutContactScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void checkoutStorage.contact().then((saved) => {
      if (saved) {
        setPhone(saved.phone);
        setEmail(saved.email ?? "");
      } else if (auth.session?.user.phone) {
        setPhone(auth.session.user.phone);
        if (auth.session.user.email) setEmail(auth.session.user.email);
      }
    });
  }, [auth.session]);

  async function continueNext() {
    setError("");
    const sessionPhone = auth.session?.user.phone ? normalizeCheckoutPhone(auth.session.user.phone) : null;
    const normalized = sessionPhone ?? normalizeCheckoutPhone(phone);
    if (!normalized) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address, or leave it blank.");
      return;
    }
    const cleanEmail = email.trim();
    await checkoutStorage.saveContact({
      phone: normalized,
      verified: Boolean(sessionPhone),
      source: sessionPhone ? "session" : "guest",
      ...(cleanEmail ? { email: cleanEmail } : {}),
    });
    navigation.navigate("CheckoutAddress");
  }

  return (
    <HidiScreen testID="H045" contentStyle={styles.zero}>
      <AppHeader title="Guest checkout contact" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Phone size={28} color={colors.action} /></View>
        <HidiText variant="title">Where should order updates go?</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>
          Checkout works without creating a marketing account. Verification alone does not enroll membership or promotions.
        </HidiText>

        {auth.session?.user.phone ? (
          <MessageCard tone="success">Using your verified signed-in mobile number for order updates: {auth.session.user.phone}.</MessageCard>
        ) : (
          <MessageCard>The existing checkout API accepts a guest phone number directly. A separate scoped guest-grant endpoint is not exposed, so this screen does not claim account membership.</MessageCard>
        )}

        {!auth.session?.user.phone ? (
          <HidiField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98765 43210" error={error && !normalizeCheckoutPhone(phone) ? error : undefined} />
        ) : null}
        <HidiField label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />

        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Continue to delivery address" onPress={() => void continueNext()} />
        {!auth.session ? (
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("SignIn", { returnTo: "checkout" })}>
            <HidiText variant="metadata" style={{ color: colors.action }}>Sign in first to use a verified session</HidiText>
          </Pressable>
        ) : null}
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});