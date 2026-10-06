import React, { useMemo } from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { BrandHeader } from "../components/Chrome";
import { EmptyState } from "../components/Primitives";
import { ProductCard } from "../components/ProductCard";
import { useCommerce } from "../store";
import type { Product } from "../domain";

export default function WishlistScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Wishlist">) {
  const { products, wishlist, toggleWishlist } = useCommerce(); const items = useMemo(() => products.filter(p => wishlist.includes(p.slug)), [products, wishlist]);
  return <View className="flex-1 bg-white"><BrandHeader navigation={navigation} title="WISHLIST" />{items.length ? <FlashList<Product> data={items} numColumns={2} renderItem={({ item }) => <ProductCard product={item} saved onToggleSaved={() => void toggleWishlist(item.slug)} onOpen={() => navigation.navigate("Product", { slug: item.slug })} />} contentContainerStyle={{ padding: 6 }} /> : <EmptyState title="Save what you love." body="Tap the heart on any style to keep it here." action="Explore HIDI" onAction={() => navigation.navigate("Catalog", { title: "All styles" })} />}</View>;
}
