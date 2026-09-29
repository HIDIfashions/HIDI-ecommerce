import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorState, OfflineBadge } from "../../components/StateViews";
import { HidiText } from "../../components/HidiText";
import { ProductGrid } from "../../components/ProductGrid";
import { useCatalog } from "../../data/CatalogContext";
import { localStore, RecentVisit } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecentlyViewed">;

export default function RecentlyViewedScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const [visits, setVisits] = useState<RecentVisit[]>([]);
  const [tracking, setTracking] = useState(true);

  const load = useCallback(() => {
    let alive = true;
    void Promise.all([localStore.recentlyViewed(), localStore.recentTrackingEnabled()]).then(([items, enabled]) => {
      if (!alive) return;
      setVisits(items);
      setTracking(enabled);
    });
    return () => { alive = false; };
  }, []);
  useFocusEffect(load);

  const products = useMemo(() => {
    if (state.kind !== "content") return [];
    const bySlug = new Map(state.data.map((product) => [product.slug, product]));
    return visits.flatMap((visit) => {
      const product = bySlug.get(visit.slug);
      return product ? [product] : [];
    });
  }, [state, visits]);

  async function clear() {
    await localStore.clearRecentlyViewed();
    setVisits([]);
  }

  async function setTrackingEnabled(value: boolean) {
    await localStore.setRecentTrackingEnabled(value);
    setTracking(value);
    if (!value) setVisits([]);
  }

  return (
    <ScrollView testID="H022" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content}>
      <AppHeader title="Recently viewed" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Worth another look.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>The styles you recently explored on this device.</HidiText>

        <View style={[styles.privacyRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Remember recently viewed</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Stored locally. Turn this off to clear history and stop future tracking.</HidiText>
          </View>
          <Switch value={tracking} onValueChange={(value) => void setTrackingEnabled(value)} thumbColor={tracking ? colors.action : colors.surface} />
        </View>

        {visits.length ? (
          <Pressable accessibilityRole="button" onPress={() => void clear()} style={styles.clear}>
            <HidiText variant="metadata" style={{ color: colors.action }}>Clear viewing history</HidiText>
          </Pressable>
        ) : null}

        {state.kind === "error" && visits.length ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
        {state.kind === "content" ? <>
          {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
          {products.length ? (
            <ProductGrid products={products} onOpen={(product) => navigation.navigate("ProductDeferred", { slug: product.slug })} />
          ) : (
            <EmptyState title="Nothing here yet." body={tracking ? "Styles you open will appear here on this device." : "Recently viewed tracking is off."} action="Browse HIDI" onAction={() => navigation.navigate("MainTabs")} />
          )}
          {visits.filter((visit) => !products.some((product) => product.slug === visit.slug)).map((visit) => (
            <View key={visit.slug} style={[styles.unavailable, { borderColor: colors.border }]}>
              <HidiText variant="secondary">{visit.name ?? visit.slug.replace(/-/g, " ")}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>
                {state.freshness === "offline-cache" ? "Unavailable in this saved catalogue snapshot" : "Unavailable"}
              </HidiText>
            </View>
          ))}
        </> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 36 },
  body: { paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 8 },
  bold: { fontWeight: "600" },
  clear: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start" },
  unavailable: { minHeight: 64, borderWidth: 1, borderRadius: 10, padding: 12, justifyContent: "center", gap: 3 },
});
