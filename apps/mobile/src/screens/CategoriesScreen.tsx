import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useCommerce } from "../store";
import { CachedImage, SearchPill, Skeleton } from "../components/Primitives";
import { primaryImage } from "../domain";

export default function CategoriesScreen() {
  const navigation = useNavigation<any>(); const { products, catalogState } = useCommerce();
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; image: string }>();
    for (const product of products) if (product.category && !map.has(product.category.slug)) map.set(product.category.slug, { name: product.category.name, slug: product.category.slug, image: primaryImage(product) });
    return Array.from(map.values());
  }, [products]);
  const collections = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; image: string }>();
    for (const product of products) for (const collection of product.collections) if (!map.has(collection.slug)) map.set(collection.slug, { name: collection.name, slug: collection.slug, image: primaryImage(product) });
    return Array.from(map.values()).slice(0, 8);
  }, [products]);
  return <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 32 }}><View className="px-4 pb-4 pt-5"><Text className="text-3xl font-black text-ink">Categories</Text><Text className="mt-1 text-sm text-muted">Find your next favourite by mood or moment.</Text></View><SearchPill onPress={() => navigation.navigate("Search")} />
    {catalogState === "loading" ? <View className="mt-5 flex-row flex-wrap px-3"><View className="w-1/2 p-1.5"><Skeleton className="aspect-square w-full" /></View><View className="w-1/2 p-1.5"><Skeleton className="aspect-square w-full" /></View></View> : null}
    <View className="mt-5 flex-row flex-wrap px-3">{categories.map(category => <Pressable key={category.slug} onPress={() => navigation.navigate("Catalog", { title: category.name, categorySlug: category.slug })} className="w-1/2 p-1.5"><View className="relative aspect-square overflow-hidden rounded-card bg-soft"><CachedImage source={{ uri: category.image }} className="h-full w-full" resizeMode="cover" /><View className="absolute inset-0 justify-end bg-black/25 p-4"><Text className="text-lg font-black text-white">{category.name}</Text></View></View></Pressable>)}</View>
    <Text className="mx-4 mb-3 mt-7 text-xl font-black text-ink">Shop by edit</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>{collections.map(item => <Pressable key={item.slug} onPress={() => navigation.navigate("Catalog", { title: item.name, collectionSlug: item.slug })} className="w-40 overflow-hidden rounded-card border border-line bg-white"><View className="aspect-[4/5] bg-soft"><CachedImage source={{ uri: item.image }} className="h-full w-full" resizeMode="cover" /></View><Text className="p-3 text-center text-sm font-extrabold text-ink">{item.name}</Text></Pressable>)}</ScrollView>
  </ScrollView>;
}
