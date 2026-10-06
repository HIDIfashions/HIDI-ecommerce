import React from "react";
import { Pressable, Text, Vibration, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Heart } from "lucide-react-native";
import type { Product } from "../domain";
import { discountPercent, money, primaryImage, productMrp } from "../domain";
import { colors, shadows } from "../theme";
import { CachedImage } from "./Primitives";

export function ProductCard({ product, saved, onOpen, onToggleSaved, widthClass = "w-1/2" }: { product: Product; saved: boolean; onOpen: () => void; onToggleSaved: () => void; widthClass?: string }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const discount = discountPercent(product); const mrp = productMrp(product);
  function toggle() { Vibration.vibrate(12); scale.value = 0.72; scale.value = withSpring(1, { damping: 7, stiffness: 220 }); onToggleSaved(); }
  return <View className={`${widthClass} px-1.5 pb-5`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${product.name}`} onPress={onOpen} className="overflow-hidden rounded-card bg-white" style={shadows.card}>
      <View className="relative aspect-[4/5] overflow-hidden rounded-t-card bg-soft">
        <CachedImage source={{ uri: primaryImage(product) }} resizeMode="cover" className="h-full w-full" fallbackLabel={product.name} />
        {!product.inStock ? <View className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1"><Text className="text-xs font-bold text-ink">SOLD OUT</Text></View> : null}
        {discount > 0 ? <View className="absolute left-2 top-2 rounded-md bg-success px-2 py-1"><Text className="text-xs font-extrabold text-white">{discount}% OFF</Text></View> : null}
      </View>
      <View className="px-3 pb-3 pt-2">
        <Text numberOfLines={1} className="text-sm font-extrabold text-ink">{product.brand || "HIDI"}</Text>
        <Text numberOfLines={1} className="mt-0.5 text-sm text-muted">{product.name}</Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-x-2">
          <Text className="text-sm font-extrabold text-ink">{money(product.minPricePaise)}</Text>
          {mrp > product.minPricePaise ? <Text className="text-xs text-gray-400 line-through">{money(mrp)}</Text> : null}
        </View>
      </View>
    </Pressable>
    <Animated.View style={[animated, { position: "absolute", right: 12, top: 10 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Remove from wishlist" : "Add to wishlist"} onPress={toggle} className="h-11 w-11 items-center justify-center rounded-full bg-white" style={shadows.card}><Heart size={20} color={colors.accent} fill={saved ? colors.accent : "transparent"} /></Pressable>
    </Animated.View>
  </View>;
}
