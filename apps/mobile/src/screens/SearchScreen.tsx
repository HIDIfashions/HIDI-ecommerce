import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft, Search, X } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useCommerce } from "../store";
import type { Product } from "../domain";
import { ProductCard } from "../components/ProductCard";
import { colors } from "../theme";
import { EmptyState } from "../components/Primitives";

export default function SearchScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Search">) {
  const { products, wishlist, toggleWishlist } = useCommerce(); const [query, setQuery] = useState("");
  const result = useMemo(() => { const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean); return tokens.length ? products.filter(p => { const text = [p.name, p.fabric, p.category?.name, ...p.collections.map(c => c.name), ...p.variants.flatMap(v => [v.color, v.size])].join(" ").toLowerCase(); return tokens.every(t => text.includes(t)); }) : []; }, [products, query]);
  return <View className="flex-1 bg-white"><View className="min-h-16 flex-row items-center gap-2 border-b border-line px-2"><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={navigation.goBack} className="h-12 w-12 items-center justify-center"><ArrowLeft size={22} color={colors.ink} /></Pressable><View className="min-h-12 flex-1 flex-row items-center rounded-xl bg-soft px-3"><Search size={18} color={colors.muted} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search HIDI" placeholderTextColor={colors.muted} returnKeyType="search" className="min-h-12 flex-1 px-3 text-base text-ink" />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setQuery("")} className="h-10 w-10 items-center justify-center"><X size={18} color={colors.muted} /></Pressable> : null}</View></View>
    {!query ? <View className="px-5 pt-8"><Text className="text-2xl font-black text-ink">What are you looking for?</Text><Text className="mt-2 text-base text-muted">Try “sage kurta”, “occasion”, a colour or your size.</Text>{["New arrivals", "Work edit", "Occasion", "Kurta", "Green"].map(item => <Pressable key={item} onPress={() => setQuery(item)} className="min-h-12 justify-center border-b border-line"><Text className="text-base font-semibold text-ink">{item}</Text></Pressable>)}</View> : result.length ? <FlashList<Product> data={result} numColumns={2} renderItem={({ item }) => <ProductCard product={item} saved={wishlist.includes(item.slug)} onToggleSaved={() => void toggleWishlist(item.slug)} onOpen={() => navigation.navigate("Product", { slug: item.slug })} />} contentContainerStyle={{ padding: 6 }} /> : <EmptyState title="No exact match." body="Try fewer words, another colour or browse all categories." action="Browse all" onAction={() => navigation.replace("Catalog", { title: "All styles" })} />}
  </View>;
}
