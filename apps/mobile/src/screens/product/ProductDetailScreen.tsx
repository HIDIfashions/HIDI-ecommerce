import React, { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronRight, Heart, ImageIcon, Truck } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { MessageCard } from "../../components/MessageCard";
import { useProductDetail } from "../../data/useProductDetail";
import { setWishlistDesired } from "../../data/wishlistStore";
import { localStore } from "../../storage/localStore";
import { formatINRPaise } from "../../models/product";
import { resolveHidiMediaUrl } from "../../network/config";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ProductDeferred">;

export default function ProductDetailScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, notFound, reload } = useProductDetail(route.params.slug);
  const [saved, setSaved] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    void localStore.wishlist().then((items) => setSaved(items.includes(route.params.slug)));
  }, [route.params.slug]);

  useEffect(() => {
    if (product) void localStore.rememberViewed(product.slug, product.name);
  }, [product]);

  useEffect(() => {
    if (product && !product.inStock) {
      navigation.replace("ProductUnavailable", { slug: product.slug });
    }
  }, [navigation, product]);

  const selected = product?.variants.find((variant) => variant.id === route.params.selectedVariantId);
  const defaultColor = selected?.color ?? product?.variants.find((variant) => variant.available > 0)?.color ?? product?.variants[0]?.color ?? "";
  const activeVariants = useMemo(
    () => product?.variants.filter((variant) => variant.color === defaultColor) ?? [],
    [product, defaultColor],
  );
  const activePrice = activeVariants.length ? Math.min(...activeVariants.map((variant) => variant.pricePaise)) : product?.minPricePaise ?? 0;
  const media = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    const specific = activeVariants.flatMap((variant) => variant.images ?? []).filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    const source = specific.length ? specific : product.images;
    return source.filter((item) => item.url && !seen.has("fallback:" + item.url));
  }, [activeVariants, product]);
  const imageUrl = resolveHidiMediaUrl(media[0]?.url);

  async function toggleSaved() {
    if (!product) return;
    const desired = !saved;
    setSaved(desired);
    const list = await setWishlistDesired(product.slug, desired, {
      pricePaise: product.minPricePaise,
      inStock: product.inStock,
    });
    setSaved(list.includes(product.slug));
  }

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><CatalogSkeleton /></SafeAreaView>;
  if (error) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><ErrorState message={error} onRetry={() => void reload()} /></SafeAreaView>;
  if (notFound || !product) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}>
        <AppHeader title="Product unavailable" onBack={navigation.goBack} />
        <View style={styles.center}>
          <HidiText variant="title">This style is no longer available.</HidiText>
          <HidiText variant="secondary" style={{ color: colors.mutedText }}>The current catalogue does not expose product details for this link.</HidiText>
          <HidiButton label="Explore HIDI" onPress={() => navigation.navigate("MainTabs", { screen: "Shop" })} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="H023" style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <AppHeader title="Product detail" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open full-screen product gallery"
          onPress={() => navigation.navigate("ProductGallery", { slug: product.slug, initialIndex: 0 })}
          style={[styles.hero, { backgroundColor: colors.blush }]}
        >
          {imageUrl && !imageFailed ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.image} onError={() => setImageFailed(true)} accessibilityLabel={media[0]?.alt || product.name} />
          ) : (
            <View style={styles.imageFallback}>
              <ImageIcon size={34} color={colors.mutedText} />
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>Product image unavailable</HidiText>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved items" : "Save item"} onPress={() => void toggleSaved()} style={[styles.heart, { backgroundColor: colors.canvas }]}>
            <Heart size={20} color={colors.action} fill={saved ? colors.action : "transparent"} />
          </Pressable>
        </Pressable>

        <HidiText variant="metadata" style={[styles.eyebrow, { color: colors.mutedText }]}>{product.category?.name ?? "HIDI EDIT"}</HidiText>
        <HidiText variant="title">{product.name}</HidiText>
        {product.shortDescription ? <HidiText variant="secondary" style={{ color: colors.mutedText }}>{product.shortDescription}</HidiText> : null}

        <View style={styles.priceRow}>
          <HidiText variant="title">{formatINRPaise(activePrice)}</HidiText>
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>inclusive of applicable taxes</HidiText>
        </View>

        <View style={[styles.selection, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Colour</HidiText>
            <HidiText variant="secondary" style={styles.bold}>{defaultColor || "Not provided"}</HidiText>
          </View>
          <View style={{ flex: 1 }}>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Size</HidiText>
            <HidiText variant="secondary" style={styles.bold}>{selected?.size ?? "Choose a size"}</HidiText>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SizeGuide", { slug: product.slug, selectedVariantId: selected?.id })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Size guide</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Garment measurements when supplied</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("FitHelper", { slug: product.slug, selectedVariantId: selected?.id })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Need fit guidance?</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>See what fit information is available</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("DetailsCare", { slug: product.slug })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Details & care</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{product.fabric || "Fabric information not provided"}</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => selected
            ? navigation.navigate("DeliveryCheck", { slug: product.slug, variantId: selected.id })
            : navigation.navigate("VariantPicker", { slug: product.slug })}
          style={[styles.row, { borderBottomColor: colors.border }]}
        >
          <Truck size={18} color={colors.action} />
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Delivery & availability</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{selected ? "Check your PIN for this selection" : "Choose a size before checking delivery"}</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Reviews", { slug: product.slug })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Ratings & reviews</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Published customer feedback</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SimilarStyles", { slug: product.slug })} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Similar styles</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Alternatives from the current catalogue</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>

        <MessageCard>
          <View style={{ gap: 5 }}>
            <HidiText variant="secondary" style={styles.bold}>Returns before purchase</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>The product API does not currently provide product-specific return eligibility. Review the published HIDI return policy before ordering.</HidiText>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://thehidi.com/returns")} style={styles.policyLink}>
              <HidiText variant="metadata" style={{ color: colors.action }}>View return policy</HidiText>
            </Pressable>
          </View>
        </MessageCard>
      </ScrollView>

      <View style={[styles.fixed, { backgroundColor: colors.canvas, borderTopColor: colors.border }]}>
        <HidiButton
          label={selected ? "Review size & add to bag" : "Choose size"}
          onPress={() => navigation.navigate("VariantPicker", { slug: product.slug, selectedVariantId: selected?.id })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  center: { flex: 1, padding: 28, justifyContent: "center", gap: 16 },
  hero: { aspectRatio: 3 / 4, borderRadius: hidiRadius.card, overflow: "hidden", marginTop: 12 },
  image: { width: "100%", height: "100%" },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heart: { position: "absolute", top: 12, right: 12, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  eyebrow: { letterSpacing: 1.2, marginTop: 18, marginBottom: 4 },
  priceRow: { marginTop: 12, gap: 3 },
  selection: { marginTop: 14, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", gap: 16 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bold: { fontWeight: "600" },
  policyLink: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  fixed: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 12, paddingHorizontal: 20 },
});
