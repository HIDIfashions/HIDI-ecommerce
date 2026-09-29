import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Heart } from "lucide-react-native";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;
const HERO = "https://thidigk.thehidi.com/brand/hidi-hero-green-garden-fullbody.webp";

export default function WelcomeScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();

  async function explore() {
    await localStore.setOnboardingSeen();
    navigation.replace("MainTabs");
  }

  return (
    <HidiScreen contentStyle={styles.content}>
      <HidiText variant="display" style={styles.wordmark}>HIDI</HidiText>
      <View style={[styles.hero, { backgroundColor: colors.blush }]}>
        <Image source={{ uri: HERO }} style={styles.image} resizeMode="cover" accessibilityLabel="HIDI editorial Indian wear" />
      </View>
      <HidiText variant="metadata" style={[styles.eyebrow, { color: colors.mutedText }]}>CLOTHES FOR REAL DAYS</HidiText>
      <HidiText variant="title" accessibilityRole="header">A little more you.</HidiText>
      <HidiText style={[styles.copy, { color: colors.mutedText }]}>
        Thoughtful pieces for all the ways you move through life.
      </HidiText>
      <View style={[styles.promise, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Heart size={16} color={colors.action} />
        <HidiText variant="metadata" style={{ flex: 1 }}>Browse freely. Save what you love. Fit over pressure.</HidiText>
      </View>

      <View style={styles.actions}>
        <HidiButton label="Explore HIDI" onPress={() => void explore()} />
        <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => navigation.navigate("SignIn")}>
          <HidiText variant="action">Sign in / join HIDI</HidiText>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => navigation.navigate("StylePreferences")}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Make it yours</HidiText>
        </Pressable>
      </View>

      <Pressable accessibilityRole="link" onPress={() => navigation.navigate("ConsentPreferences")} style={styles.privacy}>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>By continuing, you can review HIDI’s privacy choices.</HidiText>
      </Pressable>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18 },
  wordmark: { letterSpacing: 8, marginBottom: 14 },
  hero: { height: 290, borderRadius: hidiRadius.card, overflow: "hidden", marginBottom: hidiSpacing.x5 },
  image: { width: "100%", height: "100%" },
  eyebrow: { letterSpacing: 1.5, marginBottom: 6 },
  copy: { marginTop: 6 },
  promise: { flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 18 },
  actions: { marginTop: 28, gap: 8 },
  linkButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  privacy: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12 },
});
