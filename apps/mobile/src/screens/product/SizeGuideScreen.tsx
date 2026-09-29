import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { ApiVariant } from "../../models/product";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SizeGuide">;
type Unit = "cm" | "in";

function measurement(mm: number | null | undefined, unit: Unit) {
  if (typeof mm !== "number" || !Number.isFinite(mm) || mm <= 0) return "—";
  const value = unit === "cm" ? mm / 10 : mm / 25.4;
  return value.toFixed(unit === "cm" ? 1 : 1);
}

export default function SizeGuideScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);
  const [unit, setUnit] = useState<Unit>("cm");
  const [chosenId, setChosenId] = useState(route.params.selectedVariantId ?? "");

  const rows = useMemo(() => {
    if (!product) return [];
    const selected = product.variants.find((variant) => variant.id === route.params.selectedVariantId);
    const color = selected?.color ?? product.variants[0]?.color;
    const candidates = product.variants.filter((variant) => !color || variant.color === color);
    const seen = new Set<string>();
    return candidates.filter((variant) => {
      if (seen.has(variant.size)) return false;
      seen.add(variant.size);
      return true;
    });
  }, [product, route.params.selectedVariantId]);

  const hasMeasurements = rows.some((variant) => [variant.bustMm, variant.waistMm, variant.hipMm, variant.garmentLengthMm].some((value) => typeof value === "number" && value > 0));
  const chosen = rows.find((variant) => variant.id === chosenId) ?? rows.find((variant) => variant.available > 0);

  if (loading) return <View style={[styles.fill, { backgroundColor: colors.canvas }]}><CatalogSkeleton /></View>;
  if (error || !product) return <View style={[styles.fill, { backgroundColor: colors.canvas }]}><ErrorState message={error || "Size guide unavailable."} onRetry={() => void reload()} /></View>;

  return (
    <View testID="H026" style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <AppHeader title="Size guide" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <HidiText variant="title">A good fit starts here.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>{product.name} · garment measurements supplied by the catalogue</HidiText>

        <View style={styles.unitRow}>
          {(["cm", "in"] as Unit[]).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: unit === value }} onPress={() => setUnit(value)} style={[styles.unit, { borderColor: unit === value ? colors.action : colors.border, backgroundColor: unit === value ? colors.action : colors.surface }]}>
              <HidiText variant="metadata" style={{ color: unit === value ? colors.canvas : colors.ink }}>{value === "cm" ? "Centimetres" : "Inches"}</HidiText>
            </Pressable>
          ))}
        </View>

        {hasMeasurements ? (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={[styles.tableRow, styles.headerRow, { borderBottomColor: colors.border }]}>
                {["Size", "Bust", "Waist", "Hip", "Length"].map((label) => <HidiText key={label} variant="metadata" style={styles.cell}>{label}</HidiText>)}
              </View>
              {rows.map((variant: ApiVariant) => {
                const active = chosen?.id === variant.id;
                return (
                  <Pressable key={variant.id} onPress={() => variant.available > 0 && setChosenId(variant.id)} style={[styles.tableRow, { borderBottomColor: colors.border, backgroundColor: active ? colors.blush : "transparent", opacity: variant.available > 0 ? 1 : 0.5 }]}>
                    <HidiText variant="metadata" style={styles.cell}>{variant.size}</HidiText>
                    <HidiText variant="metadata" style={styles.cell}>{measurement(variant.bustMm, unit)}</HidiText>
                    <HidiText variant="metadata" style={styles.cell}>{measurement(variant.waistMm, unit)}</HidiText>
                    <HidiText variant="metadata" style={styles.cell}>{measurement(variant.hipMm, unit)}</HidiText>
                    <HidiText variant="metadata" style={styles.cell}>{measurement(variant.garmentLengthMm, unit)}</HidiText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <MessageCard>Garment measurements are not provided for this style. HIDI will not guess a size chart.</MessageCard>
        )}

        <MessageCard>
          <View style={{ gap: 6 }}>
            <HidiText variant="secondary" style={styles.bold}>How to measure</HidiText>
            <HidiText variant="metadata">Bust: measure around the fullest point, keeping the tape level.</HidiText>
            <HidiText variant="metadata">Waist: measure around your natural waist without pulling the tape tight.</HidiText>
            <HidiText variant="metadata">Garment measurements describe the product, not a body-size guarantee.</HidiText>
          </View>
        </MessageCard>

        <MessageCard>The current product API does not provide a separate category body-measurement chart or model measurements. Only supplied garment measurements are shown.</MessageCard>
      </ScrollView>
      <View style={[styles.fixed, { backgroundColor: colors.canvas, borderTopColor: colors.border }]}>
        <HidiButton
          label={chosen ? "Use size " + chosen.size : "Back to size choices"}
          onPress={() => navigation.navigate("VariantPicker", { slug: product.slug, selectedVariantId: chosen?.id })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, paddingBottom: 110, gap: 16 },
  unitRow: { flexDirection: "row", gap: 8 },
  unit: { minHeight: 44, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, justifyContent: "center" },
  tableRow: { flexDirection: "row", minHeight: 46, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { minHeight: 38 },
  cell: { width: 72, paddingHorizontal: 6 },
  bold: { fontWeight: "600" },
  fixed: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 12, paddingHorizontal: 20 },
});
