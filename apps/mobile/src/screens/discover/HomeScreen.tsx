import React, { useMemo } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Search, UserRound } from "lucide-react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { HidiText } from "../../components/HidiText";
import { ProductCard } from "../../components/ProductCard";
import { CatalogSkeleton, ErrorState, InlineFailure, OfflineBadge } from "../../components/StateViews";
import { useCatalog } from "../../data/CatalogContext";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../../theme/tokens";
const HERO = "https://thidigk.thehidi.com/brand/hidi-hero-green-garden-fullbody.webp";
export default function HomeScreen() {
  const navigation = useNavigation<any>(); const { colors } = useHidiTheme();
  const { state, featured, featuredFailed, refresh } = useCatalog(); const [recentCount, setRecentCount] = React.useState(0);
  useFocusEffect(React.useCallback(() => {
    let alive = true; void localStore.saveLastSafeRoute("home");
    void localStore.recentlyViewed().then(items => { if (alive) setRecentCount(items.length); });
    return () => { alive = false; };
  }, []));
  const products = state.kind === "content" ? state.data : [];
  const collections = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const product of products) for (const item of product.collections) map.set(item.slug, { slug: item.slug, name: item.name });
    return Array.from(map.values()).slice(0, 6);
  }, [products]);
  const everyday = collections.find(item => item.slug === "everyday") ?? collections[0] ?? { slug: "all", name: "The HIDI edit" };
  const curated = featured.length ? featured : products.slice(0, 6);
  return <ScrollView testID="H009" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
    <View style={styles.brandRow}>
      <View style={styles.brandCopy}><HidiText variant="display" style={styles.wordmark}>HIDI</HidiText><HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 2 }}>EVERYDAY, BEAUTIFULLY.</HidiText></View>
      <View style={styles.iconRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Search HIDI" onPress={() => navigation.navigate("Search")} style={styles.iconButton}><Search size={21} color={colors.ink} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Your HIDI" onPress={() => navigation.navigate("You")} style={styles.iconButton}><UserRound size={21} color={colors.ink} /></Pressable>
      </View>
    </View>
    <Pressable accessibilityRole="search" onPress={() => navigation.navigate("Search")} style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Search size={17} color={colors.mutedText} /><HidiText variant="secondary" style={{ color: colors.mutedText, flex: 1 }}>Search dresses, sets and more</HidiText>
    </Pressable>
    {state.kind === "loading" ? <CatalogSkeleton /> : null}
    {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
    {state.kind === "content" ? <>
      {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
      <ImageBackground source={{ uri: HERO }} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroShade} />
        <View style={styles.heroCopy}>
          <HidiText variant="metadata" style={styles.heroEyebrow}>THE EVERYDAY EDIT</HidiText>
          <HidiText variant="title" style={styles.heroTitle}>Everyday, beautifully.</HidiText>
          <HidiText variant="secondary" style={styles.heroText}>Easy pieces that move through real days with you.</HidiText>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Collection", { slug: everyday.slug, title: everyday.name })} style={[styles.heroButton, { backgroundColor: colors.canvas }]}><HidiText variant="action" style={{ color: colors.action }}>Explore the edit →</HidiText></Pressable>
        </View>
      </ImageBackground>
      {collections.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {collections.map(item => <Pressable key={item.slug} accessibilityRole="button" onPress={() => navigation.navigate("Listing", { title: item.name, collectionSlug: item.slug })} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}><HidiText variant="secondary">{item.name}</HidiText></Pressable>)}
      </ScrollView> : null}
      <View style={styles.sectionHeader}>
        <HidiText variant="secondary" style={styles.sectionTitle}>Made for your everyday</HidiText>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Listing", { title: "Shop all" })} style={styles.viewAll}><HidiText variant="secondary" style={{ color: colors.action }}>View all</HidiText></Pressable>
      </View>
      {featuredFailed ? <InlineFailure label="This edit could not refresh. Showing the current catalogue instead." onRetry={() => void refresh()} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalProducts}>
        {curated.map(product => <ProductCard key={product.id} product={product} compact onOpen={() => navigation.navigate("ProductDeferred", { slug: product.slug })} />)}
      </ScrollView>
      {recentCount > 0 ? <Pressable accessibilityRole="button" onPress={() => navigation.navigate("RecentlyViewed")} style={[styles.recentLink, { borderColor: colors.border }]}><View style={{ flex: 1 }}><HidiText variant="secondary" style={styles.sectionTitle}>Worth another look.</HidiText><HidiText variant="metadata" style={{ color: colors.mutedText }}>Return to styles you recently explored.</HidiText></View><HidiText variant="action" style={{ color: colors.action }}>View →</HidiText></Pressable> : null}
    </> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  brandRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  brandCopy: { flexShrink: 1, minWidth: 155, flexGrow: 1, flexBasis: "55%" },
  wordmark: { letterSpacing: 8, fontSize: 28 }, iconRow: { flexDirection: "row", flexShrink: 0 },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  search: { minHeight: 48, paddingVertical: 10, borderWidth: 1, borderRadius: hidiRadius.control, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, marginBottom: 16 },
  hero: { minHeight: 260, borderRadius: hidiRadius.card, overflow: "hidden", justifyContent: "flex-end" },
  heroImage: { borderRadius: hidiRadius.card },
  heroShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(35,24,28,0.66)" },
  heroCopy: { padding: 18, gap: 8 }, heroEyebrow: { color: "#FAF8F4", letterSpacing: 1.4 }, heroTitle: { color: "#FAF8F4", fontSize: 28, lineHeight: 34 }, heroText: { color: "#FAF8F4" },
  heroButton: { marginTop: 8, alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chips: { gap: 8, paddingVertical: 14 }, chip: { minHeight: 48, justifyContent: "center", paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 24 },
  sectionHeader: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 12 },
  sectionTitle: { fontWeight: "600", flexShrink: 1 }, viewAll: { minHeight: 48, justifyContent: "center" },
  horizontalProducts: { gap: hidiSpacing.gridGap, paddingBottom: 8 },
  recentLink: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
