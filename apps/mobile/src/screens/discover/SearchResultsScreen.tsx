import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorState, OfflineBadge, CatalogSkeleton } from "../../components/StateViews";
import { FilterSheet, SortSheet } from "../../components/FilterSortSheets";
import { ProductGrid } from "../../components/ProductGrid";
import { HidiText } from "../../components/HidiText";
import { emptyFilters, filterProducts, Filters, matchesSearch, sortProducts, SortKey } from "../../data/catalog";
import { useCatalog } from "../../data/CatalogContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import { localStore } from "../../storage/localStore";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SearchResults">;

function activeFilters(filters: Filters) {
  return Boolean(filters.sizes.length || filters.colors.length || filters.fabrics.length || filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined);
}

export default function SearchResultsScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const [filters, setFilters] = useState<Filters>(route.params.filters ?? emptyFilters);
  const [sort, setSort] = useState<SortKey>(route.params.sort ?? "recommended");
  const queryId = useRef("search-" + Date.now().toString(36));

  useEffect(() => {
    if (route.params.sort) return;
    void localStore.catalogSort().then((value) => setSort(value as SortKey));
  }, [route.params.sort]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const matched = useMemo(() => state.kind === "content" ? state.data.filter((product) => matchesSearch(product, route.params.query)) : [], [state, route.params.query]);
  const shown = useMemo(() => sortProducts(filterProducts(matched, filters), sort), [matched, filters, sort]);
  const filtered = activeFilters(filters);

  function clearOne(field: keyof Pick<Filters, "sizes" | "colors" | "fabrics">, value: string) {
    setFilters((before) => ({ ...before, [field]: before[field].filter((item) => item !== value) }));
  }

  return (
    <SafeAreaView testID={state.kind === "content" && shown.length === 0 ? "H016" : "H015"} style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <AppHeader title={shown.length === 0 && state.kind === "content" ? "No search results" : "Search results"} onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <HidiText variant="title">“{route.params.query}”</HidiText>
          {state.kind === "content" ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>{shown.length} {shown.length === 1 ? "style" : "styles"} for your search</HidiText> : null}
        </View>

        <View style={[styles.toolbarWrap, { backgroundColor: colors.canvas }]}>
          <View style={styles.toolbar}>
            <Pressable accessibilityRole="button" onPress={() => setSortOpen(true)} style={[styles.tool, { borderColor: colors.border }]}>
              <ArrowUpDown size={16} color={colors.ink} />
              <HidiText variant="metadata">Sort</HidiText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFilterOpen(true)} style={[styles.tool, { borderColor: colors.border }]}>
              <SlidersHorizontal size={16} color={colors.ink} />
              <HidiText variant="metadata">Filter{filtered ? " · active" : ""}</HidiText>
            </Pressable>
          </View>
        </View>

        {filtered ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            {filters.sizes.map((value) => <Chip key={"size"+value} label={"Size " + value} onPress={() => clearOne("sizes", value)} />)}
            {filters.colors.map((value) => <Chip key={"colour"+value} label={value} onPress={() => clearOne("colors", value)} />)}
            {filters.fabrics.map((value) => <Chip key={"fabric"+value} label={value} onPress={() => clearOne("fabrics", value)} />)}
            {(filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined) ? <Chip label="Price" onPress={() => setFilters((before) => ({ ...before, minPricePaise: undefined, maxPricePaise: undefined }))} /> : null}
          </ScrollView>
        ) : null}

        {state.kind === "loading" ? <CatalogSkeleton /> : null}
        {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
        {state.kind === "content" ? <>
          {state.freshness === "offline-cache" ? <OfflineBadge /> : null}
          {shown.length ? (
            <ProductGrid products={shown} onOpen={(product) => navigation.navigate("ProductDeferred", { slug: product.slug, queryId: queryId.current })} />
          ) : (
            <EmptyState
              icon="search"
              title="Nothing quite matches."
              body={filtered ? "Try fewer filters or another search." : "Try another product name, colour or collection."}
              action={filtered ? "Clear filters" : "Edit search"}
              onAction={() => filtered ? setFilters(emptyFilters) : navigation.navigate("Search")}
            />
          )}
        </> : null}
      </ScrollView>
      <FilterSheet visible={filterOpen} products={matched} current={filters} onClose={() => setFilterOpen(false)} onApply={(next) => { setFilters(next); setFilterOpen(false); }} />
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
});
