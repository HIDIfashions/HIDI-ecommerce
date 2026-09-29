import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { HidiText } from "../../components/HidiText";
import { ProductGrid } from "../../components/ProductGrid";
import { CatalogSkeleton, EmptyState, ErrorState, InlineFailure, OfflineBadge } from "../../components/StateViews";
import { useCatalog } from "../../data/CatalogContext";
import { localStore } from "../../storage/localStore";
import { useAuth } from "../../auth/AuthContext";
import { useHidiTheme } from "../../theme/HidiTheme";

export default function SavedScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const { state, refresh } = useCatalog();
  const [savedSlugs, setSavedSlugs] = useState<string[] | null>(null);

  const reloadSaved = useCallback(() => {
    let alive = true;
    void localStore.wishlist().then((items) => { if (alive) setSavedSlugs(items); });
    return () => { alive = false; };
  }, []);

  useFocusEffect(reloadSaved);

  const products = useMemo(() => {
    if (state.kind !== "content" || !savedSlugs) return [];
    const wanted = new Set(savedSlugs);
    return state.data.filter((product) => wanted.has(product.slug));
  }, [state, savedSlugs]);

  const missingCount = savedSlugs ? Math.max(0, savedSlugs.length - products.length) : 0;

  if (savedSlugs?.length === 0) {
    return (
      <View testID="H021" style={[styles.root, { backgroundColor: colors.canvas }]}>
        <EmptyState
          title="Your next favourites belong here."
          body="Save the pieces you love and come back to them anytime."
          action="Find your next favourite"
          onAction={() => navigation.navigate("Shop")}
        />
        {!auth.session ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SignIn", { returnTo: "saved" })} style={styles.signIn}>
            <HidiText variant="metadata" style={{ color: colors.action }}>Sign in to sync your favourites</HidiText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView testID="H020" style={[styles.root, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.content}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>SAVED ITEMS</HidiText>
      <HidiText variant="title">The ones you love.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{savedSlugs?.length ?? 0} saved {savedSlugs?.length === 1 ? "style" : "styles"} · take your time.</HidiText>

      {state.kind === "loading" || savedSlugs === null ? <CatalogSkeleton /> : null}
      {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
      {state.kind === "content" ? <>
        {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
        {missingCount > 0 ? (
          <InlineFailure label={state.freshness === "offline-cache"
            ? "Some saved styles are not present in this saved catalogue snapshot."
            : String(missingCount) + (missingCount === 1 ? " saved style is" : " saved styles are") + " no longer in the published catalogue."} />
        ) : null}
        <ProductGrid
          products={products}
          onOpen={(product) => navigation.navigate("ProductDeferred", { slug: product.slug })}
        />
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>Saved items do not reserve stock. Availability is shown from the latest loaded catalogue.</HidiText>
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 8 },
  signIn: { minHeight: 48, justifyContent: "center", alignItems: "center", marginHorizontal: 24, marginBottom: 28 },
});
