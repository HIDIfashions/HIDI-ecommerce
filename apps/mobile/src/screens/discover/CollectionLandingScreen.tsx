import React, { useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { ProductGrid } from "../../components/ProductGrid";
import { CatalogSkeleton, ErrorState, OfflineBadge } from "../../components/StateViews";
import { useCatalog } from "../../data/CatalogContext";
import { productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Collection">;

export default function CollectionLandingScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const products = useMemo(() => {
    if (state.kind !== "content") return [];
    if (route.params.slug === "all") return state.data;
    return state.data.filter((product) => product.collections.some((item) => item.slug === route.params.slug));
  }, [state, route.params.slug]);
  const hero = products[0];

  return (
    <HidiScreen testID="H011" contentStyle={styles.zeroTop}>
      <AppHeader title="Collection landing" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>HIDI EDIT</HidiText>
        <HidiText variant="title">The {route.params.title.toLowerCase()} edit.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Clean lines. Considered texture. Pieces that move with your day.</HidiText>

        {state.kind === "loading" ? <CatalogSkeleton /> : null}
        {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
        {state.kind === "content" ? <>
          {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
          {products.length ? <>
            <View style={[styles.hero, { backgroundColor: colors.blush }]}>
              {hero && productImage(hero) ? <Image source={{ uri: productImage(hero) }} style={styles.heroImage} resizeMode="cover" /> : null}
            </View>
            <View style={styles.collectionHeading}>
              <View>
                <HidiText variant="secondary" style={styles.bold}>The considered collection</HidiText>
                <HidiText variant="metadata" style={{ color: colors.mutedText }}>{products.length} published {products.length === 1 ? "style" : "styles"}</HidiText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Listing", { title: route.params.title, collectionSlug: route.params.slug })} style={styles.shopLink}>
                <HidiText variant="action" style={{ color: colors.action }}>Shop this edit →</HidiText>
              </Pressable>
            </View>
            <ProductGrid products={products.slice(0, 4)} onOpen={(product) => navigation.navigate("ProductDeferred", { slug: product.slug })} />
            <HidiButton label="Shop this edit" onPress={() => navigation.navigate("Listing", { title: route.params.title, collectionSlug: route.params.slug })} />
          </> : (
            <View style={[styles.expired, { borderColor: colors.border }]}>
              <HidiText variant="title">This edit has moved on.</HidiText>
              <HidiText variant="secondary" style={{ color: colors.mutedText }}>The collection is not currently published. The rest of HIDI is still here.</HidiText>
              <HidiButton label="Browse all styles" onPress={() => navigation.replace("Listing", { title: "Shop all" })} />
            </View>
          )}
        </> : null}
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 36, gap: 8 },
  hero: { aspectRatio: 16 / 9, borderRadius: hidiRadius.card, overflow: "hidden", marginTop: 12 },
  heroImage: { width: "100%", height: "100%" },
  collectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 8 },
  bold: { fontWeight: "600" },
  shopLink: { minHeight: 48, justifyContent: "center" },
  expired: { marginTop: 20, borderWidth: 1, borderRadius: hidiRadius.card, padding: 18, gap: 14 },
});
