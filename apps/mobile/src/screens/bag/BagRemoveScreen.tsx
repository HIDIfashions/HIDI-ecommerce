import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { cartLineImage } from "../../models/cart";
import { formatINRPaise } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "BagRemove">;

export default function BagRemoveScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const cart = useCart();
  const line = cart.cart?.items.find((item) => item.id === route.params.lineId);
  const [error, setError] = useState("");

  if (!line) {
    return <HidiScreen testID="H040" contentStyle={styles.zero}><AppHeader title="Remove bag item" onBack={navigation.goBack} /><View style={styles.body}><MessageCard>This item is no longer in your current bag.</MessageCard><HidiButton label="Back to bag" onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })} /></View></HidiScreen>;
  }

  async function remove(moveToSaved: boolean) {
    setError("");
    try {
      if (moveToSaved) await cart.moveToSaved(line.id);
      else await cart.removeLine(line.id);
      navigation.navigate("MainTabs", { screen: "Bag" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The item could not be removed.");
    }
  }

  return (
    <HidiScreen testID="H040" contentStyle={styles.zero}>
      <AppHeader title="Remove bag item" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">A little change of heart?</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Remove this exact SKU from your bag, or keep it for later on this device.</HidiText>
        <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{cartLineImage(line) ? <Image source={{ uri: cartLineImage(line) }} style={styles.image} /> : null}</View>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>{line.product.name}</HidiText>
            <HidiText variant="metadata">{line.variant.color} · Size {line.variant.size} · Qty {line.quantity}</HidiText>
            <HidiText variant="secondary">{formatINRPaise(line.lineTotalPaise)}</HidiText>
          </View>
        </View>
        <MessageCard>Failed deletion leaves the server bag line intact. Undo is offered from the bag only after a confirmed removal.</MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Remove item" loading={cart.busyKey === "remove:" + line.id} onPress={() => void remove(false)} />
        <HidiButton label="Move to saved for later" disabled={Boolean(cart.busyKey)} onPress={() => void remove(true)} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  summary: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  thumb: { width: 72, height: 92, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  bold: { fontWeight: "600" },
});
