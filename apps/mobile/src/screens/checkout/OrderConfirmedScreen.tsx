import React, { useEffect, useRef, useState } from "react";
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
import { confirmationPresentation, mayClearConfirmedAttempt } from "../../models/confirmation";
import { formatINRPaise } from "../../models/product";
import { resolveHidiMediaUrl } from "../../network/config";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";
type Props = NativeStackScreenProps<RootStackParamList, "OrderConfirmed">;
export default function OrderConfirmedScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme(); const [data, setData] = useState<CheckoutConfirmation | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const generation = useRef(0);
  async function load() {
    const request = ++generation.current; setError(""); setBusy(true);
    try {
      const next = await getCheckoutConfirmation(route.params.orderNumber);
      confirmationPresentation(next, route.params.orderNumber);
      if (request !== generation.current) return;
      setData(next);
      const attempt = await checkoutStorage.attempt();
      if (request === generation.current && mayClearConfirmedAttempt(next, attempt)) await checkoutStorage.clearAfterOrder();
    } catch (cause) { if (request === generation.current) setError(cause instanceof Error ? cause.message : "Order status could not be loaded."); }
    finally { if (request === generation.current) setBusy(false); }
  }
  useEffect(() => { setData(null); void load(); return () => { generation.current++; }; }, [route.params.orderNumber]);
  if (!data && !error) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !data) return <HidiScreen><ErrorState message={error || "Order unavailable."} onRetry={() => void load()} /></HidiScreen>;
  const view = confirmationPresentation(data, route.params.orderNumber);
  return <HidiScreen testID={view.accepted ? "H059" : "H057"} contentStyle={styles.zero}>
    <AppHeader title={view.accepted ? "Order confirmed" : "Order status"} onBack={() => navigation.navigate("MainTabs", { screen: "Home" })} />
    <View style={styles.body}>
      {view.accepted ? <View style={[styles.icon, { backgroundColor: colors.blush }]}><CheckCircle2 size={30} color={colors.success} /></View> : null}
      <HidiText variant="title">{view.title}</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Order number {data.orderNumber}</HidiText>
      <MessageCard>{view.paymentCopy}</MessageCard>
      {!view.accepted ? <MessageCard>Do not create another payment while this order is unresolved. Checking status only reads the existing order.</MessageCard> : null}
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <HidiText variant="secondary" style={styles.bold}>Items</HidiText>
        {data.items.map(item => {
          const image = resolveHidiMediaUrl(item.image);
          return <View key={item.id} style={styles.line}>
            <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{image ? <Image source={{ uri: image }} style={styles.image} /> : null}</View>
            <View style={{ flex: 1 }}><HidiText variant="secondary" style={styles.bold}>{item.productName}</HidiText><HidiText variant="secondary" style={{ color: colors.mutedText }}>{item.color} · Size {item.size} · Qty {item.quantity}</HidiText></View>
          </View>;
        })}
        <View style={styles.totalRow}><HidiText variant="secondary">Order total</HidiText><HidiText variant="secondary" style={styles.bold}>{formatINRPaise(data.totalPaise)}</HidiText></View>
      </View>
      {view.accepted ? <HidiButton label="Track my order" onPress={() => navigation.navigate("OrderDetail", { orderNumber: data.orderNumber })} /> : <HidiButton label="Check order status" loading={busy} onPress={() => void load()} />}
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("ContactHidi")}><HidiText variant="secondary" style={{ color: colors.action }}>Contact HIDI</HidiText></Pressable>
    </View>
  </HidiScreen>;
}
const styles = StyleSheet.create({ zero: { paddingHorizontal: 0, paddingTop: 0 }, body: { padding: 22, gap: 15, alignItems: "center" }, icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" }, card: { alignSelf: "stretch", borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 }, bold: { fontWeight: "600" }, line: { flexDirection: "row", gap: 10, alignItems: "center" }, thumb: { width: 48, height: 62, borderRadius: 8, overflow: "hidden" }, image: { width: "100%", height: "100%" }, totalRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }, secondary: { minHeight: 48, justifyContent: "center" } });
