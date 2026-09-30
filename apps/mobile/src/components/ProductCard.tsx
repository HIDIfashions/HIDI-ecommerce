import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Heart } from "lucide-react-native";
import type { ApiProduct } from "../models/product";
import { formatINRPaise, productImage } from "../models/product";
import { localStore } from "../storage/localStore";
import { setWishlistDesired } from "../data/wishlistStore";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../theme/tokens";
export function ProductCard({ product, onOpen, compact = false, onSavedChange, savedBaselinePaise }: {
  product: ApiProduct; onOpen: () => void; compact?: boolean; onSavedChange?: (saved: boolean) => void; savedBaselinePaise?: number;
}) {
  const { colors } = useHidiTheme(); const { width, fontScale } = useWindowDimensions();
  const [saved, setSaved] = useState(false); const [imageFailed, setImageFailed] = useState(false); const desiredSaved = useRef(false);
  useEffect(() => {
    let alive = true; setImageFailed(false);
    void localStore.wishlist().then(items => { if (!alive) return; const value = items.includes(product.slug); desiredSaved.current = value; setSaved(value); });
    return () => { alive = false; };
  }, [product.slug]);
  async function toggleSave() {
    const desired = !desiredSaved.current; desiredSaved.current = desired; setSaved(desired);
    const list = await setWishlistDesired(product.slug, desired, { pricePaise: product.minPricePaise, inStock: product.inStock });
    if (desiredSaved.current === desired) { const finalSaved = list.includes(product.slug); setSaved(finalSaved); onSavedChange?.(finalSaved); }
  }
  const image = productImage(product); const colorsCount = new Set(product.variants.map(v => v.color).filter(Boolean)).size;
  const expandedText = fontScale >= 1.6 || width < 360;
  return <View style={[styles.card, compact ? { width: expandedText ? Math.min(width - 40, 300) : 156 } : expandedText ? { width: "100%" } : undefined]}>
    <Pressable accessibilityRole="button" accessibilityLabel={"Open " + product.name} onPress={onOpen} style={styles.mediaPress}>
      <View style={[styles.media, { backgroundColor: colors.blush }]}>
        {image && !imageFailed ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} accessibilityLabel={product.name} onError={() => setImageFailed(true)} /> : <View style={styles.imageFallback}><HidiText variant="secondary">Image unavailable</HidiText></View>}
        {!product.inStock ? <View style={[styles.soldOut, { backgroundColor: colors.canvas }]}><HidiText variant="metadata">Unavailable</HidiText></View> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved items" : "Save item"} accessibilityState={{ selected: saved }} onPress={() => void toggleSave()} style={[styles.heart, { backgroundColor: colors.surface }]}>
      <Heart size={18} color={colors.action} fill={saved ? colors.action : "transparent"} />
    </Pressable>
    <Pressable onPress={onOpen} accessibilityRole="button" style={styles.copy}>
      <HidiText variant="secondary" numberOfLines={expandedText ? undefined : 2} style={styles.name}>{product.name}</HidiText>
      <HidiText variant="secondary" style={styles.price}>{formatINRPaise(product.minPricePaise)}</HidiText>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>{colorsCount ? colorsCount + (colorsCount === 1 ? " colour" : " colours") : "HIDI"}</HidiText>
      {savedBaselinePaise !== undefined && savedBaselinePaise !== product.minPricePaise ? <HidiText variant="secondary" style={{ color: colors.caution }}>Price changed since you saved this</HidiText> : null}
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { width: "48%", position: "relative", marginBottom: hidiSpacing.x3 },
  mediaPress: { borderRadius: hidiRadius.card, overflow: "hidden" },
  media: { aspectRatio: 3 / 4, borderRadius: hidiRadius.card, overflow: "hidden" },
  image: { width: "100%", height: "100%" }, imageFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  heart: { position: "absolute", top: 8, right: 8, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  soldOut: { position: "absolute", left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  copy: { minHeight: 76, paddingTop: 8 }, name: { fontWeight: "600" }, price: { fontWeight: "600", marginTop: 2 },
});
