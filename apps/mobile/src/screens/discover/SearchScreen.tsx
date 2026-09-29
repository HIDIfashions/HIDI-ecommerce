import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Clock3, Search, X } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiText } from "../../components/HidiText";
import { InlineFailure } from "../../components/StateViews";
import { useCatalog } from "../../data/CatalogContext";
import { matchesSearch } from "../../data/catalog";
import { ProductCard } from "../../components/ProductCard";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

export default function SearchScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [rememberSearches, setRememberSearches] = useState(true);

  useEffect(() => {
    void Promise.all([localStore.recentSearches(), localStore.searchTrackingEnabled()]).then(([items, enabled]) => {
      setRecents(items);
      setRememberSearches(enabled);
    });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const products = state.kind === "content" ? state.data : [];
  const matches = useMemo(() => debounced ? products.filter((product) => matchesSearch(product, debounced)).slice(0, 3) : [], [products, debounced]);
  const categories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; kind: "collection" | "category" }>();
    for (const product of products) {
      if (product.category) map.set("category:" + product.category.id, { slug: product.category.slug, name: product.category.name, kind: "category" });
      for (const item of product.collections) map.set("collection:" + item.id, { slug: item.slug, name: item.name, kind: "collection" });
    }
    const all = Array.from(map.values());
    return debounced
      ? all.filter((item) => item.name.toLowerCase().includes(debounced.toLowerCase())).slice(0, 4)
      : all.slice(0, 4);
  }, [products, debounced]);

  async function submit(value: string) {
    const clean = value.trim().slice(0, 160);
    if (!clean) return;
    await localStore.rememberSearch(clean);
    setRecents(await localStore.recentSearches());
    navigation.navigate("SearchResults", { query: clean });
  }

  async function removeRecent(value: string) {
    await localStore.removeSearch(value);
    setRecents(await localStore.recentSearches());
  }

  async function clearRecents() {
    await localStore.clearSearches();
    setRecents([]);
  }

  async function changeSearchTracking(enabled: boolean) {
    await localStore.setSearchTrackingEnabled(enabled);
    setRememberSearches(enabled);
    if (!enabled) setRecents([]);
  }

  function openCategory(item: { slug: string; name: string; kind: "collection" | "category" }) {
    navigation.navigate("Listing", {
      title: item.name,
      ...(item.kind === "collection" ? { collectionSlug: item.slug } : { categorySlug: item.slug }),
    });
  }

  return (
    <View testID={debounced ? "H014" : "H013"} style={[styles.root, { backgroundColor: colors.canvas }]}>
      <AppHeader title={debounced ? "Search suggestions" : "Search entry"} onBack={navigation.goBack} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Search size={17} color={colors.mutedText} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void submit(query)}
            returnKeyType="search"
            placeholder="Search for your next favourite"
            placeholderTextColor={colors.mutedText}
            selectionColor={colors.action}
            maxLength={160}
            style={[styles.input, { color: colors.ink }]}
            accessibilityLabel="Search HIDI"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} style={styles.clearIcon}>
              <X size={17} color={colors.mutedText} />
            </Pressable>
          ) : null}
        </View>

        {!debounced ? <>
          <View style={styles.sectionHeader}>
            <HidiText variant="secondary" style={styles.bold}>Recent searches</HidiText>
            {recents.length ? (
              <Pressable accessibilityRole="button" onPress={() => void clearRecents()} style={styles.smallAction}>
                <HidiText variant="metadata" style={{ color: colors.action }}>Clear all</HidiText>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.privacyRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <HidiText variant="metadata" style={styles.bold}>Remember searches</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>Stored only on this device.</HidiText>
            </View>
            <Switch value={rememberSearches} onValueChange={(value) => void changeSearchTracking(value)} thumbColor={rememberSearches ? colors.action : colors.surface} />
          </View>
          {recents.map((item) => (
            <View key={item} style={[styles.row, { borderBottomColor: colors.border }]}>
              <Pressable accessibilityRole="button" onPress={() => void submit(item)} style={styles.rowMain}>
                <Clock3 size={15} color={colors.mutedText} />
                <HidiText variant="secondary">{item}</HidiText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + item} onPress={() => void removeRecent(item)} style={styles.rowRemove}>
                <X size={16} color={colors.mutedText} />
              </Pressable>
            </View>
          ))}

          <HidiText variant="secondary" style={[styles.bold, styles.sectionTitle]}>Popular right now</HidiText>
          <View style={styles.chips}>
            {categories.map((item) => (
              <Pressable key={item.kind + item.slug} onPress={() => openCategory(item)} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <HidiText variant="metadata">{item.name}</HidiText>
              </Pressable>
            ))}
          </View>

          <HidiText variant="secondary" style={[styles.bold, styles.sectionTitle]}>Browse by category</HidiText>
          {categories.map((item) => (
            <Pressable key={"browse"+item.kind+item.slug} onPress={() => openCategory(item)} style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
              <HidiText variant="secondary">{item.name}</HidiText>
              <HidiText variant="secondary">›</HidiText>
            </Pressable>
          ))}
        </> : <>
          <Pressable accessibilityRole="button" onPress={() => void submit(debounced)} style={[styles.submitRow, { borderBottomColor: colors.border }]}>
            <Search size={16} color={colors.ink} />
            <View style={{ flex: 1 }}>
              <HidiText variant="secondary">{debounced}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>View all matching styles</HidiText>
            </View>
            <HidiText variant="secondary">›</HidiText>
          </Pressable>

          {categories.length ? <>
            <HidiText variant="secondary" style={[styles.bold, styles.sectionTitle]}>Categories</HidiText>
            {categories.map((item) => (
              <Pressable key={item.kind+item.slug} onPress={() => openCategory(item)} style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
                <HidiText variant="secondary">{item.name}</HidiText>
                <HidiText variant="secondary">›</HidiText>
              </Pressable>
            ))}
          </> : null}

          {state.kind === "error" ? <>
            <InlineFailure label="Live search is unavailable. Your recent searches are still on this device." onRetry={() => void refresh()} />
            {recents.length ? (
              <View style={styles.offlineRecents}>
                <HidiText variant="metadata" style={styles.bold}>Recent searches</HidiText>
                {recents.slice(0, 4).map((item) => (
                  <Pressable key={"offline-"+item} accessibilityRole="button" onPress={() => setQuery(item)} style={styles.offlineRecent}>
                    <HidiText variant="secondary">{item}</HidiText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </> : null}

          {matches.length ? <>
            <HidiText variant="secondary" style={[styles.bold, styles.sectionTitle]}>A few favourites</HidiText>
            <View style={styles.productRows}>
              {matches.map((product) => (
                <ProductCard key={product.id} product={product} compact onOpen={() => navigation.navigate("ProductDeferred", { slug: product.slug })} />
              ))}
            </View>
          </> : null}
        </>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: hidiRadius.control, flexDirection: "row", alignItems: "center", paddingLeft: 12 },
  input: { flex: 1, minHeight: 48, fontSize: 15, paddingHorizontal: 10 },
  clearIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22 },
  sectionTitle: { marginTop: 24, marginBottom: 6 },
  bold: { fontWeight: "600" },
  smallAction: { minHeight: 48, justifyContent: "center", paddingHorizontal: 8 },
  privacyRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, minHeight: 52, flexDirection: "row", gap: 10, alignItems: "center" },
  rowRemove: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 19, justifyContent: "center", paddingHorizontal: 12 },
  categoryRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  submitRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  productRows: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  offlineRecents: { marginTop: 14, gap: 4 },
  offlineRecent: { minHeight: 44, justifyContent: "center" },
});
