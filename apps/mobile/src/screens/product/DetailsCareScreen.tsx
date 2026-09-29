import React from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "DetailsCare">;

function Field({ label, value }: { label: string; value?: string | null }) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.field, { borderBottomColor: colors.border }]}>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>{label}</HidiText>
      <HidiText variant="secondary">{value?.trim() || "Not provided"}</HidiText>
    </View>
  );
}

export default function DetailsCareScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !product) return <HidiScreen><ErrorState message={error || "Details are unavailable."} onRetry={() => void reload()} /></HidiScreen>;

  return (
    <HidiScreen testID="H028" contentStyle={styles.zero}>
      <AppHeader title="Details & care" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">In the details.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>{product.name}</HidiText>
        <Field label="Fabric composition" value={product.fabric} />
        <Field label="Product description" value={product.description || product.shortDescription} />
        <Field label="Care" value={product.care} />
        <Field label="Fit & finish" value={null} />
        <Field label="Lining" value={null} />
        <Field label="Origin / seller disclosure" value={null} />

        <MessageCard>
          Unknown catalogue fields are shown as “Not provided”. HIDI does not infer sustainability, origin, lining or fit claims that are absent from approved product data.
        </MessageCard>

        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://thehidi.com/returns")} style={styles.policy}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Review HIDI return policy →</HidiText>
        </Pressable>

        <HidiButton label="Back to product" onPress={() => navigation.navigate("ProductDeferred", { slug: product.slug })} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 10 },
  field: { minHeight: 64, justifyContent: "center", gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  policy: { minHeight: 48, justifyContent: "center" },
});
