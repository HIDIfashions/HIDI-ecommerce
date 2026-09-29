import React, { useCallback, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { AlertTriangle, ChevronRight, Gift, RotateCcw } from "lucide-react-native";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ProductCard } from "../../components/ProductCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useCart } from "../../data/CartContext";
import { useCatalog } from "../../data/CatalogContext";
import { cartLineImage } from "../../models/cart";
import { formatINRPaise } from "../../models/product";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";

export default function ShoppingBagScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useHidiTheme();
  const cartState = useCart();
  const catalog = useCatalog();
  const [checkoutBoundary, setCheckoutBoundary] = useState(false);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [undoError, setUndoError] = useState("");

  useFocusEffect(useCallback(() => {
    void cartState.refresh();
    void localStore.recentlyViewed().then((items) => setRecentSlugs(items.map((item) => item.slug)));
  }, [cartState.refresh]));

  const recentProducts = useMemo(() => {
    if (catalog.state.kind !== "content") return [];
    const wanted = new Set(recentSlugs);
    return catalog.state.data.filter((product) => wanted.has(product.slug)).slice(0, 2);
  }, [catalog.state, recentSlugs]);

  async function undo() {
    setUndoError("");
    try { await cartState.undoRemove(); }
    catch (cause) { setUndoError(cause instanceof Error ? cause.message : "Undo could not be confirmed."); }
  }

  if (cartState.loading && !cartState.cart) {
    return <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={styles.content}><CatalogSkeleton /></ScrollView>;
  }

  if (cartState.error && !cartState.cart) {
    return <View style={[styles.fill, { backgroundColor: colors.canvas }]}><ErrorState message={cartState.error} onRetry={() => void cartState.refresh()} /></View>;
  }

  const cart = cartState.cart;
  if (!cart || cart.items.length === 0) {
    return (
      <ScrollView testID="H038" style={[styles.fill, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.empty}>
        <View style={[styles.bagIcon, { backgroundColor: colors.blush }]}><HidiText variant="title" style={{ color: colors.action }}>♡</HidiText></View>
        <HidiText variant="title" style={styles.center}>A little room for something lovely.</HidiText>
        <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>Your bag is empty. Explore thoughtful pieces chosen for your day.</HidiText>
        <HidiButton label="Discover your favourites" onPress={() => navigation.navigate("Shop")} />
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Saved")} style={styles.secondary}>
          <HidiText variant="secondary" style={{ color: colors.action }}>View saved styles</HidiText>
        </Pressable>
        {cartState.savedForLater.length ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SavedForLater")} style={[styles.savedShortcut, { borderColor: colors.border }]}>
            <View>
              <HidiText variant="secondary" style={styles.bold}>Saved for later</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>{cartState.savedForLater.length} deferred bag {cartState.savedForLater.length === 1 ? "item" : "items"}</HidiText>
            </View>
            <ChevronRight size={18} color={colors.mutedText} />
          </Pressable>
        ) : null}
        {recentProducts.length ? (
          <View style={styles.recent}>
            <HidiText variant="secondary" style={styles.bold}>Recently viewed</HidiText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {recentProducts.map((product) => <ProductCard key={product.id} product={product} compact onOpen={() => navigation.navigate("ProductDeferred", { slug: product.slug })} />)}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const hasBlockingLine = cart.items.some((line) => line.variant.available < line.quantity);

  return (
    <ScrollView testID="H037" style={[styles.fill, { backgroundColor: colors.canvas }]} contentContainerStyle={styles.content}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>SHOPPING BAG</HidiText>
      <HidiText variant="title">Your everyday edit.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}, ready for review.</HidiText>

      {cartState.stale ? (
        <MessageCard tone="error">Your bag could not refresh. The lines below are the last saved bag state and may be stale. Retry before checkout.</MessageCard>
      ) : null}

      {cartState.attention.length ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("BagAttention")} style={[styles.attention, { borderColor: colors.caution }]}>
          <AlertTriangle size={20} color={colors.caution} />
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Your bag needs attention.</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{cartState.attention.length} price or availability {cartState.attention.length === 1 ? "change" : "changes"} to review.</HidiText>
          </View>
          <ChevronRight size={18} color={colors.caution} />
        </Pressable>
      ) : null}

      {cartState.undoCandidate ? (
        <MessageCard tone="success">
          <View style={styles.undoRow}>
            <HidiText variant="metadata" style={{ flex: 1 }}>{cartState.undoCandidate.product.name} was removed.</HidiText>
            <Pressable accessibilityRole="button" onPress={() => void undo()} style={styles.undoButton}>
              <RotateCcw size={15} color={colors.action} />
              <HidiText variant="metadata" style={{ color: colors.action }}>Undo</HidiText>
            </Pressable>
          </View>
        </MessageCard>
      ) : null}
      {undoError ? <MessageCard tone="error">{undoError}</MessageCard> : null}

      <View style={styles.lines}>
        {cart.items.map((line) => (
          <View key={line.id} style={[styles.line, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => navigation.navigate("ProductDeferred", { slug: line.product.slug, selectedVariantId: line.variant.id })} style={[styles.thumb, { backgroundColor: colors.blush }]}>
              {cartLineImage(line) ? <Image source={{ uri: cartLineImage(line) }} style={styles.image} resizeMode="cover" /> : null}
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <HidiText variant="secondary" style={styles.bold}>{line.product.name}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>{line.variant.color} · Size {line.variant.size}</HidiText>
              <HidiText variant="secondary">{formatINRPaise(line.lineTotalPaise)}</HidiText>
              <HidiText variant="metadata" style={{ color: line.variant.available < line.quantity ? colors.error : colors.mutedText }}>
                Qty {line.quantity} · {line.variant.available} currently available
              </HidiText>
              <View style={styles.lineActions}>
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate("BagEdit", { lineId: line.id })} style={styles.action}><HidiText variant="metadata" style={{ color: colors.action }}>Edit</HidiText></Pressable>
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate("BagRemove", { lineId: line.id })} style={styles.action}><HidiText variant="metadata" style={{ color: colors.action }}>Remove</HidiText></Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Promotions")} style={[styles.promo, { borderColor: colors.border }]}>
        <Gift size={18} color={colors.action} />
        <View style={{ flex: 1 }}>
          <HidiText variant="secondary" style={styles.bold}>Offers & promo code</HidiText>
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>Only server-confirmed discounts can change your payable amount.</HidiText>
        </View>
        <ChevronRight size={18} color={colors.mutedText} />
      </Pressable>

      {cartState.savedForLater.length ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SavedForLater")} style={[styles.promo, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>Saved for later</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{cartState.savedForLater.length} {cartState.savedForLater.length === 1 ? "item" : "items"} on this device</HidiText>
          </View>
          <ChevronRight size={18} color={colors.mutedText} />
        </Pressable>
      ) : null}

      <View style={[styles.summary, { borderTopColor: colors.border }]}>
        <View style={styles.totalRow}><HidiText variant="secondary">Server bag subtotal</HidiText><HidiText variant="secondary" style={styles.bold}>{formatINRPaise(cart.subtotalPaise)}</HidiText></View>
        <View style={styles.totalRow}><HidiText variant="metadata" style={{ color: colors.mutedText }}>Shipping</HidiText><HidiText variant="metadata" style={{ color: colors.mutedText }}>Calculated at checkout</HidiText></View>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>The current bag API does not return promotions, shipping, tax allocation or a quote version. Final payable amount is therefore not invented here.</HidiText>
      </View>

      {checkoutBoundary ? <MessageCard>Checkout is Phase 3 (H045+). Phase 2 preserves your canonical bag and stops before creating a checkout/payment attempt.</MessageCard> : null}
      <HidiButton
        label={"Continue to checkout · " + formatINRPaise(cart.subtotalPaise)}
        disabled={cartState.stale || cartState.attention.length > 0 || hasBlockingLine}
        onPress={() => setCheckoutBoundary(true)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 12 },
  empty: { flexGrow: 1, padding: 28, justifyContent: "center", gap: 16 },
  bagIcon: { width: 76, height: 76, borderRadius: 38, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  bold: { fontWeight: "600" },
  savedShortcut: { minHeight: 70, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recent: { gap: 10, marginTop: 4 },
  attention: { minHeight: 72, borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  undoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  undoButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 5 },
  lines: { gap: 2 },
  line: { flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 88, height: 112, borderRadius: hidiRadius.control, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  lineActions: { flexDirection: "row", gap: 12 },
  action: { minHeight: 44, justifyContent: "center", paddingRight: 8 },
  promo: { minHeight: 72, borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  summary: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
