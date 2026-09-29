import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCircle2 } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { getCheckoutConfirmation } from "../../data/checkoutApi";
import type { CheckoutConfirmation } from "../../data/checkoutApi";
import { formatINRPaise } from "../../models/product";
import { resolveHidiMediaUrl } from "../../network/config";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "OrderConfirmed">;

export default function OrderConfirmedScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const [data, setData] = useState<CheckoutConfirmation | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const next = await getCheckoutConfirmation(route.params.orderNumber);
      setData(next);
      if (["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"].includes(String(next.status).toUpperCase())) await checkoutStorage.clearAfterOrder();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order confirmation could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, [route.params.orderNumber]);
  if (!data && !error) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !data) return <HidiScreen><ErrorState message={error || "Order unavailable."} onRetry={() => void load()} /></HidiScreen>;

  const cod = data.payment?.method === "cod" || !data.payment;
  return (
    <HidiScreen testID="H059" contentStyle={styles.zero}>
      <AppHeader title="Order confirmed" onBack={() => navigation.navigate("MainTabs", { screen: "Home" })} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><CheckCircle2 size={30} color={colors.success} /></View>
        <HidiText variant="title">Order received.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Order number {data.orderNumber}</HidiText>
        <MessageCard tone="success">{cod ? "This is an accepted unpaid order. Pay on delivery if COD is enabled by operations." : "Payment state: " + (data.payment?.status ?? data.status)}</MessageCard>
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <HidiText variant="secondary" style={styles.bold}>Items</HidiText>
          {data.items.slice(0, 3).map((item) => {
            const image = resolveHidiMediaUrl(item.image);
            return (
              <View key={item.id} style={styles.line}>
                <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{image ? <Image source={{ uri: image }} style={styles.image} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <HidiText variant="metadata" style={styles.bold}>{item.productName}</HidiText>
                  <HidiText variant="metadata" style={{ color: colors.mutedText }}>{item.color} · Size {item.size} · Qty {item.quantity}</HidiText>
                </View>
              </View>
            );
          })}
          <View style={styles.totalRow}><HidiText variant="secondary">Order total</HidiText><HidiText variant="secondary" style={styles.bold}>{formatINRPaise(data.totalPaise)}</HidiText></View>
        </View>
        <HidiButton label="Track my order" onPress={() => navigation.navigate("OrderDetail", { orderNumber: data.orderNumber })} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Continue shopping</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15, alignItems: "center" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  card: { alignSelf: "stretch", borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  bold: { fontWeight: "600" },
  line: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 48, height: 62, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  secondary: { minHeight: 48, justifyContent: "center" },
});
