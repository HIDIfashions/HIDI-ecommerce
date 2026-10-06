import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { ArrowUpDown, Check, SlidersHorizontal, X } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { BrandHeader } from "../components/Chrome";
import { EmptyState, Field, PrimaryButton } from "../components/Primitives";
import { ProductCard } from "../components/ProductCard";
import { useCommerce } from "../store";
import type { Product } from "../domain";
import { colors } from "../theme";
import { catalogFacets, emptyCatalogFilters, filterAndSortProducts, type CatalogFilters, type CatalogSort } from "../catalogLogic";

type Props = NativeStackScreenProps<RootStackParamList, "Catalog">;
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} className="min-h-[48px] flex-row items-center justify-between border-b border-line py-3"><Text className="text-base text-ink">{label}</Text><View className={`h-6 w-6 items-center justify-center rounded-md border ${selected ? "border-accent bg-accent" : "border-line bg-white"}`}>{selected ? <Check size={15} color="white" /> : null}</View></Pressable>; }

export default function CatalogScreen({ navigation, route }: Props) {
  const { products, wishlist, toggleWishlist } = useCommerce(); const sheet = useRef<BottomSheetModal>(null); const sortSheet = useRef<BottomSheetModal>(null);
  const [filters, setFilters] = useState<CatalogFilters>(emptyCatalogFilters); const [draft, setDraft] = useState<CatalogFilters>(emptyCatalogFilters); const [sort, setSort] = useState<CatalogSort>("recommended");
  const source = useMemo(() => products.filter(p => (!route.params?.collectionSlug || p.collections.some(c => c.slug === route.params?.collectionSlug)) && (!route.params?.categorySlug || p.category?.slug === route.params.categorySlug) && (!route.params?.query || (p.name + " " + p.fabric + " " + p.category?.name).toLowerCase().includes(route.params.query.toLowerCase()))), [products, route.params]);
  const facets = useMemo(() => catalogFacets(source), [source]);
  const result = useMemo(() => filterAndSortProducts(source, filters, sort), [source, filters, sort]);
  const draftResultCount = useMemo(() => filterAndSortProducts(source, draft, sort).length, [source, draft, sort]);
  const toggle = useCallback((field: "sizes" | "colors", value: string) => setDraft(current => ({ ...current, [field]: current[field].includes(value) ? current[field].filter(x => x !== value) : [...current[field], value] })), []);
  const activeCount = filters.sizes.length + filters.colors.length + (filters.min !== undefined || filters.max !== undefined ? 1 : 0) + (filters.discount !== undefined ? 1 : 0);
  return <View className="flex-1 bg-white"><BrandHeader navigation={navigation} title={route.params?.title ?? "SHOP"} />
    <View className="flex-row border-y border-line bg-white"><Pressable onPress={() => sortSheet.current?.present()} className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 border-r border-line"><ArrowUpDown size={17} color={colors.ink} /><Text className="font-bold text-ink">SORT</Text></Pressable><Pressable onPress={() => { setDraft(filters); sheet.current?.present(); }} className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2"><SlidersHorizontal size={17} color={colors.ink} /><Text className="font-bold text-ink">FILTER{activeCount ? ` (${activeCount})` : ""}</Text></Pressable></View>
    <View className="px-4 py-3"><Text className="text-sm text-muted">{result.length} styles · Brand: HIDI</Text></View>
    {result.length ? <FlashList<Product> data={result} numColumns={2} keyExtractor={item => item.id} renderItem={({ item }) => <ProductCard product={item} saved={wishlist.includes(item.slug)} onToggleSaved={() => void toggleWishlist(item.slug)} onOpen={() => navigation.navigate("Product", { slug: item.slug })} />} contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 30 }} /> : <EmptyState title="Nothing matches yet." body="Remove a filter or explore another HIDI edit." action="Clear filters" onAction={() => setFilters(emptyCatalogFilters)} />}
    <BottomSheetModal ref={sheet} snapPoints={["88%"]} enablePanDownToClose backgroundStyle={{ borderRadius: 24 }}><BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}><View className="flex-row items-center justify-between"><Text className="text-2xl font-black text-ink">Smart filters</Text><Pressable onPress={() => sheet.current?.dismiss()} className="h-12 w-12 items-center justify-center"><X size={22} color={colors.ink} /></Pressable></View><Text className="mt-1 text-sm text-muted">Instantly refine by size, colour, price and discount.</Text>
      <Text className="mb-2 mt-6 text-lg font-extrabold text-ink">Brand</Text><Choice label="HIDI" selected onPress={() => undefined} />
      <Text className="mb-2 mt-6 text-lg font-extrabold text-ink">Size</Text>{facets.sizes.map(value => <Choice key={value} label={value} selected={draft.sizes.includes(value)} onPress={() => toggle("sizes", value)} />)}
      <Text className="mb-2 mt-6 text-lg font-extrabold text-ink">Colour</Text>{facets.colors.map(value => <Choice key={value} label={value} selected={draft.colors.includes(value)} onPress={() => toggle("colors", value)} />)}
      <Text className="mb-3 mt-6 text-lg font-extrabold text-ink">Price</Text><View className="flex-row gap-3"><View className="flex-1"><Field label="Min ₹" keyboardType="number-pad" value={draft.min?.toString() ?? ""} onChangeText={v => setDraft(d => ({ ...d, min: v ? Number(v.replace(/\D/g, "")) : undefined }))} /></View><View className="flex-1"><Field label="Max ₹" keyboardType="number-pad" value={draft.max?.toString() ?? ""} onChangeText={v => setDraft(d => ({ ...d, max: v ? Number(v.replace(/\D/g, "")) : undefined }))} /></View></View>
      <Text className="mb-2 mt-6 text-lg font-extrabold text-ink">Discount tier</Text>{[10, 20, 30, 40].map(value => <Choice key={value} label={`${value}% and above`} selected={draft.discount === value} onPress={() => setDraft(d => ({ ...d, discount: d.discount === value ? undefined : value }))} />)}
      <View className="mt-8 flex-row gap-3"><View className="flex-1"><Pressable onPress={() => setDraft(emptyCatalogFilters)} className="min-h-[52px] items-center justify-center rounded-xl border border-line"><Text className="font-extrabold text-ink">CLEAR</Text></Pressable></View><View className="flex-1"><PrimaryButton label={`SHOW ${draftResultCount}`} onPress={() => { setFilters(draft); sheet.current?.dismiss(); }} /></View></View>
    </BottomSheetScrollView></BottomSheetModal>
    <BottomSheetModal ref={sortSheet} snapPoints={["48%"]} enablePanDownToClose><View className="px-5 pb-8"><Text className="mb-4 text-2xl font-black text-ink">Sort by</Text>{([['recommended','Recommended'],['price-low','Price: Low to High'],['price-high','Price: High to Low'],['discount','Best Discount']] as [CatalogSort,string][]).map(([value,label]) => <Choice key={value} label={label} selected={sort === value} onPress={() => { setSort(value); sortSheet.current?.dismiss(); }} />)}</View></BottomSheetModal>
  </View>;
}
