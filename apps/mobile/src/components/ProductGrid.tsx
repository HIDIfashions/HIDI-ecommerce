import React from "react";
import { StyleSheet, View } from "react-native";
import type { ApiProduct } from "../models/product";
import type { WishlistSnapshot } from "../storage/localStore";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  onOpen,
  savedSnapshots,
  onSavedChange,
}: {
  products: ApiProduct[];
  onOpen: (product: ApiProduct) => void;
  savedSnapshots?: Record<string, WishlistSnapshot>;
  onSavedChange?: (product: ApiProduct, saved: boolean) => void;
}) {
  return (
    <View style={styles.grid}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onOpen={() => onOpen(product)}
          savedBaselinePaise={savedSnapshots?.[product.slug]?.pricePaise}
          onSavedChange={(saved) => onSavedChange?.(product, saved)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
});
