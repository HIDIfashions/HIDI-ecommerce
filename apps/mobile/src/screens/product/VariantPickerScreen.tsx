import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AlertCircle, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useProductDetail } from "../../data/useProductDetail";
import { useCart } from "../../data/CartContext";
import { formatINRPaise, productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "VariantPicker">;

function validHex(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export default function VariantPickerScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);
  const cart = useCart();
  const initial = product?.variants.find((variant) => variant.id === route.params.selectedVariantId);
  const [color, setColor] = useState("");
  const [variantId, setVariantId] = useState(route.params.selectedVariantId ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!product || color) return;
    const seed = initial?.color ?? product.variants.find((variant) => variant.available > 0)?.color ?? product.variants[0]?.color ?? "";
    setColor(seed);
  }, [color, initial?.color, product]);

  const colorsAvailable = useMemo(() => product ? Array.from(new Set(product.variants.map((variant) => variant.color))) : [], [product]);
  const variants = useMemo(() => product?.variants.filter((variant) => variant.color === color) ?? [], [product, color]);
  const selected = variants.find((variant) => variant.id === variantId);

  useEffect(() => {
    if (variantId && !variants.some((variant) => variant.id === variantId)) setVariantId("");
  }, [variantId, variants]);

  async function add() {
    if (!selected) {
      setMessage("Choose an available size to continue.");
      return;
    }
    setMessage("");
    try {
      const result = await cart.addVariant(selected.id, 1);
      let cleanupFailed = false;
      if (route.params.savedForLaterKey) {
        try { await cart.removeSavedForLater(route.params.savedForLaterKey); }
        catch { cleanupFailed = true; }
      }
      AccessibilityInfo.announceForAccessibility(selected.size + ", " + selected.color + " added to bag.");
      navigation.replace("AddedToBag", {
        slug: product!.slug,
        variantId: selected.id,
        quantity: 1,
        reconciled: result.reconciled,
        savedCleanupFailed: cleanupFailed || undefined,
      });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "We couldn’t add this selection.");
    }
  }

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><CatalogSkeleton /></SafeAreaView>;
  if (error || !product) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><ErrorState message={error || "Unable to load size choices."} onRetry={() => void reload()} /></SafeAreaView>;

  const image = productImage(product);

  return (
    <SafeAreaView testID="H025" style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <AppHeader title="Choose size & color" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{image ? <Image source={{ uri: image }} style={styles.thumbImage} resizeMode="cover" /> : null}</View>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>{product.name}</HidiText>
            <HidiText variant="secondary">{formatINRPaise(selected?.pricePaise ?? product.minPricePaise)}</HidiText>
            {selected ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>SKU {selected.sku}</HidiText> : null}
          </View>
        </View>

        <HidiText variant="metadata" style={{ color: colors.mutedText }}>Colour</HidiText>
        <View style={styles.swatches}>
          {colorsAvailable.map((value) => {
            const sample = product.variants.find((variant) => variant.color === value);
            const active = color === value;
            return (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={"Colour " + value} onPress={() => { setColor(value); setVariantId(""); setMessage(""); }} style={styles.swatchButton}>
                <View style={[styles.swatch, { backgroundColor: validHex(sample?.colorHex) ?? colors.surface, borderColor: active ? colors.action : colors.border, borderWidth: active ? 2 : 1 }]} />
                <HidiText variant="metadata">{value}</HidiText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <HidiText variant="secondary" style={styles.bold}>Choose your size</HidiText>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SizeGuide", { slug: product.slug, selectedVariantId: selected?.id })} style={styles.link}>
            <HidiText variant="metadata" style={{ color: colors.action }}>Size guide</HidiText>
          </Pressable>
        </View>

        <View style={styles.sizes}>
          {variants.map((variant) => {
            const unavailable = variant.available < 1;
            const active = selected?.id === variant.id;
            return (
              <Pressable
                key={variant.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={unavailable ? "Size " + variant.size + " unavailable, open stock alert" : "Choose size " + variant.size}
                onPress={() => unavailable
                  ? navigation.navigate("StockAlert", { slug: product.slug, variantId: variant.id })
                  : (setVariantId(variant.id), setMessage(""))}
                style={[
                  styles.size,
                  { borderColor: active ? colors.action : colors.border, backgroundColor: active ? colors.action : colors.surface },
                ]}
              >
                <HidiText variant="secondary" style={{ color: active ? colors.canvas : unavailable ? colors.mutedText : colors.ink, textDecorationLine: unavailable ? "line-through" : "none" }}>
                  {variant.size}
                </HidiText>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <MessageCard tone="success">
            <HidiText variant="metadata">Selected: {selected.size} · {selected.color} · {formatINRPaise(selected.pricePaise)} · {selected.available} currently available</HidiText>
          </MessageCard>
        ) : (
          <MessageCard>
            <View style={styles.inline}>
              <AlertCircle size={16} color={colors.action} />
              <HidiText variant="metadata" style={{ flex: 1 }}>A size is required before this item can enter your bag.</HidiText>
            </View>
          </MessageCard>
        )}

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("FitHelper", { slug: product.slug, selectedVariantId: selected?.id })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Need a little guidance?</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>See available fit guidance</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        {message ? <MessageCard tone="error">{message}</MessageCard> : null}
      </ScrollView>
      <View style={[styles.fixed, { borderTopColor: colors.border, backgroundColor: colors.canvas }]}>
        <HidiButton label="Add to bag" loading={cart.busyKey === "add:" + selected?.id} disabled={!selected} onPress={() => void add()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 110, gap: 14 },
  summary: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 92, borderRadius: hidiRadius.control, overflow: "hidden" },
  thumbImage: { width: "100%", height: "100%" },
  bold: { fontWeight: "600" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  swatchButton: { minWidth: 56, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 4 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 48, justifyContent: "center" },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  size: { minWidth: 52, minHeight: 48, borderWidth: 1, borderRadius: hidiRadius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  inline: { flexDirection: "row", gap: 8, alignItems: "center" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  fixed: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 12, paddingHorizontal: 20 },
});
