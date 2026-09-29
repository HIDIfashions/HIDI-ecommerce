import React, { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Search } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { CatalogSkeleton, ErrorState, OfflineBadge } from "../../components/StateViews";
import { HidiText } from "../../components/HidiText";
import { useCatalog } from "../../data/CatalogContext";
import { productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";

type Taxon = {
  id: string;
  slug: string;
  name: string;
  kind: "collection" | "category";
  image?: string;
};

export default function ShopCategoriesScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();

  const taxa = useMemo<Taxon[]>(() => {
    if (state.kind !== "content") return [];
    const map = new Map<string, Taxon>();
    for (const product of state.data) {
      if (product.category) {
        const key = "category:" + product.category.id;
        if (!map.has(key)) map.set(key, {
          id: product.category.id,
          slug: product.category.slug,
          name: product.category.name,
          kind: "category",
          image: productImage(product),
        });
      }
      for (const collection of product.collections) {
        const key = "collection:" + collection.id;
        if (!map.has(key)) map.set(key, {
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          kind: "collection",
          image: productImage(product),
        });
      }
    }
    return Array.from(map.values());
  }, [state]);

  function open(taxon: Taxon) {
    navigation.navigate("Listing", {
      title: taxon.name,
      ...(taxon.kind === "collection" ? { collectionSlug: taxon.slug } : { categorySlug: taxon.slug }),
    });
  }

  return (
    <ScrollView testID="H010" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.3 }}>SHOP CATEGORIES</HidiText>
      <HidiText variant="title" style={styles.heading}>Find your kind of style.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>A wardrobe for every side of you.</HidiText>

      <Pressable onPress={() => navigation.navigate("Search")} style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Search size={17} color={colors.mutedText} />
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>Search all categories</HidiText>
      </Pressable>

      {state.kind === "loading" ? <CatalogSkeleton /> : null}
      {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
      {state.kind === "content" ? <>
        {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
        <View style={styles.grid}>
          {taxa.map((taxon) => (
            <Pressable key={taxon.kind + taxon.id} accessibilityRole="button" onPress={() => open(taxon)} style={styles.card}>
              <View style={[styles.imageWrap, { backgroundColor: colors.blush }]}>
                {taxon.image ? <Image source={{ uri: taxon.image }} style={styles.image} resizeMode="cover" /> : null}
              </View>
              <HidiText variant="secondary" style={styles.label}>{taxon.name} →</HidiText>
            </Pressable>
          ))}
        </View>
        {!taxa.length ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <HidiText variant="secondary">The current published catalogue does not expose category rows yet.</HidiText>
          </View>
        ) : null}
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  heading: { marginTop: 6 },
  search: { minHeight: 48, marginTop: 18, marginBottom: 16, borderWidth: 1, borderRadius: hidiRadius.control, paddingHorizontal: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48%", marginBottom: 18 },
  imageWrap: { aspectRatio: 4 / 3, borderRadius: hidiRadius.card, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  label: { marginTop: 8, fontWeight: "600" },
  empty: { borderWidth: 1, borderRadius: hidiRadius.card, padding: 16 },
});
