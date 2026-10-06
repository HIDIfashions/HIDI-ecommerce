import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { BrandHeader } from "../components/Chrome";
import { EmptyState } from "../components/Primitives";
import { commerceApi } from "../api";
import { useCommerce } from "../store";
import { colors } from "../theme";

export default function OrdersScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Orders">) {
  const { auth } = useCommerce(); const [orders, setOrders] = useState<any[]>([]); const [busy, setBusy] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let alive = true; if (!auth) { setBusy(false); return; } void commerceApi.orders(auth.access_token).then(value => { if (alive) setOrders(Array.isArray(value) ? value : []); }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : "Orders unavailable."); }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; }; }, [auth?.access_token]);
  return <View className="flex-1 bg-white"><BrandHeader navigation={navigation} title="ORDERS" />{busy ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.accent} /></View> : error ? <EmptyState title="Orders could not load." body={error} action="Back to profile" onAction={navigation.goBack} /> : orders.length ? <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>{orders.map((order, index) => <View key={String(order.orderNumber ?? order.id ?? index)} className="rounded-card border border-line bg-white p-4"><View className="flex-row justify-between gap-3"><Text className="font-black text-ink">Order {String(order.orderNumber ?? order.id ?? index + 1)}</Text><Text className="text-sm font-bold text-accent">{String(order.status ?? "Status unavailable")}</Text></View><Text className="mt-2 text-sm text-muted">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "Order date unavailable"}</Text></View>)}</ScrollView> : <EmptyState title="No orders yet." body="Once you place an order, tracking and after-sales options will appear here." action="Shop HIDI" onAction={() => navigation.navigate("Catalog", { title: "All styles" })} />}</View>;
}
