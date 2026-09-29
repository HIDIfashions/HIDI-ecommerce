import React, { useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { EmptyState } from "../../components/StateViews";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { useCatalog } from "../../data/CatalogContext";
import { formatINRPaise } from "../../models/product";
import { resolveHidiMediaUrl } from "../../network/config";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SavedForLater">;

export default function SavedForLaterScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const cart = useCart();
  const catalog = useCatalog();

  const currentBySlug = useMemo(() => {
    const map = new Map<string, any>();
    if (catalog.state.kind === "content") for (const product of catalog.state.data) map.set(product.slug, product);
    return map;
  }, [catalog.state]);

  return (
    <HidiScreen testID="H044" contentStyle={styles.zero}>
      <AppHeader title="Saved for later" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Saved for later.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Deferred bag items are stored on this device because the current server cart has no saved-items endpoint.</HidiText>

        {!cart.savedForLater.length ? (
          <EmptyState title="Nothing saved from your bag." body="Items moved out of the bag can wait here without being purchased automatically." action="Back to bag" onAction={() => navigation.navigate("MainTabs", { screen: "Bag" })} />
        ) : cart.savedForLater.map((item) => {
          const product = currentBySlug.get(item.slug);
          const variant = product?.variants.find((entry: any) => entry.id === item.variantId);
          const available = Boolean(variant && variant.available >= item.quantity && product?.inStock);
          const currentPrice = variant?.pricePaise;
          return (
            <View key={item.key} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <View style={[styles.thumb, { backgroundColor: colors.blush }]}>
                  {resolveHidiMediaUrl(item.image) ? <Image source={{ uri: resolveHidiMediaUrl(item.image) }} style={styles.image} /> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <HidiText variant="secondary" style={styles.bold}>{item.name}</HidiText>
                  <HidiText variant="metadata">{item.color} · Size {item.size} · Qty {item.quantity}</HidiText>
                  <HidiText variant="secondary">{currentPrice !== undefined ? formatINRPaise(currentPrice) : formatINRPaise(item.savedPricePaise)}</HidiText>
                  {!available ? <HidiText variant="metadata" style={{ color: colors.error }}>Preferred SKU is currently unavailable.</HidiText> : null}
                  {currentPrice !== undefined && currentPrice !== item.savedPricePaise ? <HidiText variant="metadata" style={{ color: colors.caution }}>Price changed since it was saved.</HidiText> : null}
                </View>
              </View>
              <HidiButton
                label={available ? "Review size & move to bag" : "Choose another size"}
                onPress={() => navigation.navigate("VariantPicker", { slug: item.slug, selectedVariantId: available ? item.variantId : undefined, savedForLaterKey: item.key })}
              />
              <Pressable accessibilityRole="button" style={styles.remove} onPress={() => void cart.removeSavedForLater(item.key)}>
                <HidiText variant="metadata" style={{ color: colors.action }}>Remove from saved for later</HidiText>
              </Pressable>
            </View>
          );
        })}

        {cart.savedForLater.length ? <MessageCard>Moving an item back removes its local Saved-for-later entry only after the canonical server bag confirms the add.</MessageCard> : null}
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  thumb: { width: 72, height: 92, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  bold: { fontWeight: "600" },
  remove: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
