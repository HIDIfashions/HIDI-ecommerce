import React from "react";
import { StyleSheet, View } from "react-native";
import type { ApiProduct } from "../models/product";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, onOpen }: { products: ApiProduct[]; onOpen: (product: ApiProduct) => void }) {
  return (
    <View style={styles.grid}>
      {products.map((product) => <ProductCard key={product.id} product={product} onOpen={() => onOpen(product)} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
});
