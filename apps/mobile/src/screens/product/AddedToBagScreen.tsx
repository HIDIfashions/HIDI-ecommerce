import React, { useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { useProductDetail } from "../../data/useProductDetail";
import { formatINRPaise, productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddedToBag">;

export default function AddedToBagScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();
  const detail = useProductDetail(route.params.slug);
  const variant = detail.product?.variants.find((item) => item.id === route.params.variantId);
  const canonicalLine = useMemo(() => cart?.items.find((item) => item.variant.id === route.params.variantId), [cart, route.params.variantId]);

  return (
    <HidiScreen testID="H036" contentStyle={styles.zero}>
      <AppHeader title="Added to bag" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Check size={28} color={colors.success} /></View>
        <HidiText variant="title">A lovely choice.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Your selected HIDI SKU is confirmed in your bag.</HidiText>

        {detail.product && variant ? (
          <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{productImage(detail.product) ? <Image source={{ uri: productImage(detail.product) }} style={styles.image} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <HidiText variant="secondary" style={styles.bold}>{detail.product.name}</HidiText>
              <HidiText variant="metadata">{variant.color} · Size {variant.size} · Qty {route.params.quantity}</HidiText>
              <HidiText variant="metadata">SKU {variant.sku}</HidiText>
              <HidiText variant="secondary">{formatINRPaise((canonicalLine?.unitPricePaise ?? variant.pricePaise) * route.params.quantity)}</HidiText>
            </View>
          </View>
        ) : null}

        {cart ? (
          <View style={styles.totalRow}>
            <HidiText variant="secondary">Bag subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})</HidiText>
            <HidiText variant="secondary" style={styles.bold}>{formatINRPaise(cart.subtotalPaise)}</HidiText>
          </View>
        ) : null}

        {route.params.reconciled ? <MessageCard tone="success">The first add response was uncertain, so HIDI re-read your bag and confirmed the item before showing success.</MessageCard> : null}
        {route.params.savedCleanupFailed ? <MessageCard tone="error">The item is in your bag, but its local Saved-for-later entry could not be cleared. Review Saved for later before adding it again.</MessageCard> : null}

        <HidiButton label="View bag" onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("ProductDeferred", { slug: route.params.slug, selectedVariantId: route.params.variantId })}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Continue shopping</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 16 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  summary: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  thumb: { width: 70, height: 90, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bold: { fontWeight: "600" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
