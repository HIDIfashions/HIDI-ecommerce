import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ruler } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "FitHelper">;

export default function FitHelperScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();

  return (
    <HidiScreen testID="H027" contentStyle={styles.zero}>
      <AppHeader title="Find my fit" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Ruler size={30} color={colors.action} /></View>
        <HidiText variant="title">Fit guidance, without guessing.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>
          The current HIDI commerce API does not expose the blueprint’s fit-recommendation contract, so this app will not infer a body size or claim confidence from garment measurements alone.
        </HidiText>
        <MessageCard>
          No body measurements are collected, saved, or sent from this screen. When an approved fit endpoint exists, recommendations must explain their basis and still let you choose any size.
        </MessageCard>
        <HidiButton label="View size guide" onPress={() => navigation.replace("SizeGuide", { slug: route.params.slug, selectedVariantId: route.params.selectedVariantId })} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.replace("VariantPicker", { slug: route.params.slug, selectedVariantId: route.params.selectedVariantId })}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Back to size choices</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16 },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
