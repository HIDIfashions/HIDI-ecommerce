import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Minus, Plus } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { useProductDetail } from "../../data/useProductDetail";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "BagEdit">;

export default function BagEditScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const cart = useCart();
  const line = cart.cart?.items.find((item) => item.id === route.params.lineId);
  const detail = useProductDetail(line?.product.slug ?? "");
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (line) setQuantity(line.quantity);
  }, [line?.id, line?.quantity]);

  const variants = useMemo(() => detail.product?.variants.filter((variant) => variant.color === line?.variant.color) ?? [], [detail.product, line?.variant.color]);
  const max = line ? Math.max(1, Math.min(10, line.variant.available)) : 1;

  if (!line) {
    return <HidiScreen testID="H039" contentStyle={styles.zero}><AppHeader title="Edit bag item" onBack={navigation.goBack} /><View style={styles.body}><MessageCard tone="error">This bag line is no longer present. Return to your bag to review the latest state.</MessageCard><HidiButton label="Back to bag" onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })} /></View></HidiScreen>;
  }

  async function update() {
    setMessage("");
    try {
      await cart.updateQuantity(line.id, quantity);
      navigation.navigate("MainTabs", { screen: "Bag" });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to update this bag item.");
    }
  }

  return (
    <HidiScreen testID="H039" contentStyle={styles.zero}>
      <AppHeader title="Edit bag item" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">{line.product.name}</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>{line.variant.color} · current size {line.variant.size}</HidiText>

        <HidiText variant="secondary" style={styles.bold}>Size</HidiText>
        <View style={styles.sizes}>
          {variants.map((variant) => {
            const current = variant.id === line.variant.id;
            return (
              <Pressable
                key={variant.id}
                accessibilityRole="button"
                onPress={() => !current && setMessage("The current bag API can update quantity but cannot atomically replace a SKU. Open the product to choose another size without risking a hidden duplicate.")}
                style={[styles.size, { borderColor: current ? colors.action : colors.border, backgroundColor: current ? colors.action : colors.surface, opacity: variant.available > 0 ? 1 : 0.45 }]}
              >
                <HidiText variant="secondary" style={{ color: current ? colors.canvas : colors.ink }}>{variant.size}</HidiText>
              </Pressable>
            );
          })}
        </View>

        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("ProductDeferred", { slug: line.product.slug, selectedVariantId: line.variant.id })} style={styles.openProduct}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Open product to choose another size</HidiText>
        </Pressable>

        <HidiText variant="secondary" style={styles.bold}>Quantity</HidiText>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" disabled={quantity <= 1} onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={styles.step}><Minus size={18} color={colors.ink} /></Pressable>
          <HidiText variant="secondary" style={styles.qty}>{quantity}</HidiText>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" disabled={quantity >= max} onPress={() => setQuantity((value) => Math.min(max, value + 1))} style={styles.step}><Plus size={18} color={colors.ink} /></Pressable>
        </View>

        <MessageCard>Resulting line total if the server confirms this quantity: {formatINRPaise(line.unitPricePaise * quantity)}. Inventory is revalidated on update.</MessageCard>
        {message ? <MessageCard tone="error">{message}</MessageCard> : null}
        <HidiButton label="Update bag" loading={cart.busyKey === "update:" + line.id} disabled={quantity === line.quantity || quantity > max} onPress={() => void update()} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 14 },
  bold: { fontWeight: "600" },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  size: { minWidth: 50, minHeight: 48, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  openProduct: { minHeight: 48, justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderColor: "#DED5D2", borderRadius: 8 },
  step: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  qty: { minWidth: 42, textAlign: "center" },
});
