import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SlidersHorizontal, ArrowUpDown, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { FilterSheet, SortSheet } from "../../components/FilterSortSheets";
import { ProductGrid } from "../../components/ProductGrid";
import { CatalogSkeleton, EmptyState, ErrorState, OfflineBadge } from "../../components/StateViews";
import { HidiText } from "../../components/HidiText";
import { emptyFilters, filterProducts, Filters, sortProducts, SortKey } from "../../data/catalog";
import { useCatalog } from "../../data/CatalogContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import { localStore } from "../../storage/localStore";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Listing">;

function hasFilters(filters: Filters) {
  return Boolean(filters.sizes.length || filters.colors.length || filters.fabrics.length || filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined);
}

export default function ListingScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const [filters, setFilters] = useState<Filters>(route.params.filters ?? emptyFilters);
  const [sort, setSort] = useState<SortKey>(route.params.sort ?? "recommended");

  useEffect(() => {
    if (route.params.sort) return;
    void localStore.catalogSort().then((value) => setSort(value as SortKey));
  }, [route.params.sort]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const source = useMemo(() => {
    if (state.kind !== "content") return [];
    return state.data.filter((product) => {
      if (route.params.collectionSlug && !product.collections.some((item) => item.slug === route.params.collectionSlug)) return false;
      if (route.params.categorySlug && product.category?.slug !== route.params.categorySlug) return false;
      return true;
    });
  }, [state, route.params.collectionSlug, route.params.categorySlug]);

  const shown = useMemo(() => sortProducts(filterProducts(source, filters), sort), [source, filters, sort]);
  const active = hasFilters(filters);

  function clearOne(field: keyof Pick<Filters, "sizes" | "colors" | "fabrics">, value: string) {
    setFilters((before) => ({ ...before, [field]: before[field].filter((item) => item !== value) }));
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} testID={active ? "H019" : "H012"}>
      <AppHeader title="Product listing" onBack={navigation.goBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <HidiText variant="title">{route.params.title}</HidiText>
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>{shown.length} considered {shown.length === 1 ? "style" : "styles"}</HidiText>
        </View>

        <View style={[styles.toolbarWrap, { backgroundColor: colors.canvas }]}>
          <View style={styles.toolbar}>
            <Pressable accessibilityRole="button" onPress={() => setSortOpen(true)} style={[styles.tool, { borderColor: colors.border }]}>
              <ArrowUpDown size={16} color={colors.ink} />
              <HidiText variant="metadata">Sort</HidiText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFilterOpen(true)} style={[styles.tool, { borderColor: colors.border }]}>
              <SlidersHorizontal size={16} color={colors.ink} />
              <HidiText variant="metadata">Filter{active ? " · " + (filters.sizes.length + filters.colors.length + filters.fabrics.length + (filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined ? 1 : 0)) : ""}</HidiText>
            </Pressable>
          </View>
        </View>

        {active ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            {filters.sizes.map((value) => <Chip key={"size"+value} label={"Size " + value} onPress={() => clearOne("sizes", value)} />)}
            {filters.colors.map((value) => <Chip key={"color"+value} label={value} onPress={() => clearOne("colors", value)} />)}
            {filters.fabrics.map((value) => <Chip key={"fabric"+value} label={value} onPress={() => clearOne("fabrics", value)} />)}
            {(filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined) ? <Chip label="Price" onPress={() => setFilters((before) => ({ ...before, minPricePaise: undefined, maxPricePaise: undefined }))} /> : null}
            <Pressable accessibilityRole="button" onPress={() => setFilters(emptyFilters)} style={styles.clearAll}>
              <HidiText variant="metadata" style={{ color: colors.action }}>Clear all</HidiText>
            </Pressable>
          </ScrollView>
        ) : null}

        {state.kind === "loading" ? <CatalogSkeleton /> : null}
        {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
        {state.kind === "content" ? <>
          {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
          {shown.length ? (
            <ProductGrid products={shown} onOpen={(product) => navigation.navigate("ProductDeferred", { slug: product.slug })} />
          ) : (
            <EmptyState
              icon="search"
              title="Nothing quite matches."
              body="Keep fewer filters or explore the full edit."
              action={active ? "Clear filters" : "Browse all styles"}
              onAction={() => active ? setFilters(emptyFilters) : navigation.replace("Listing", { title: "Shop all" })}
            />
          )}
        </> : null}
      </ScrollView>

      <FilterSheet visible={filterOpen} products={source} current={filters} onClose={() => setFilterOpen(false)} onApply={(next) => { setFilters(next); setFilterOpen(false); }} />
      <SortSheet visible={sortOpen} current={sort} onClose={() => setSortOpen(false)} onApply={(next) => { setSort(next); void localStore.saveCatalogSort(next); setSortOpen(false); }} />
    </SafeAreaView>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={"Remove filter " + label} onPress={onPress} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <HidiText variant="metadata">{label}</HidiText>
      <X size={13} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  titleBlock: { paddingTop: 20, paddingBottom: 12 },
  toolbarWrap: { paddingBottom: 10 },
  toolbar: { flexDirection: "row", gap: 10 },
  tool: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: hidiRadius.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  filterChips: { gap: 8, paddingBottom: 12 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 },
  clearAll: { minHeight: 38, justifyContent: "center", paddingHorizontal: 8 },
});
