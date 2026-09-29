import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { BadgeCheck, ChevronRight, FileText, PackageCheck, RefreshCcw, Truck } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useAuth } from "../../auth/AuthContext";
import { createAfterSalesRequest, cancelAfterSalesRequest, getAccountOrder, getAccountOrders, submitOrderReview } from "../../data/ordersApi";
import { formatINRPaise } from "../../models/product";
import type { AccountOrder, AfterSalesDraft, AfterSalesType, OrderItem, OrderReturnRequest } from "../../models/order";
import { eligibleReturnItems, evidenceRequired, findRequest, formatStatus, latestRequest, needsRefundAttention, orderImage, requestAmountPaise, RETURN_REASONS, shortDate } from "../../models/order";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";

type Nav = { navigate: (...args: any[]) => void; replace: (...args: any[]) => void; push: (...args: any[]) => void; goBack: () => void };
type ScreenProps = { navigation: Nav; route: { params?: Record<string, any> } };

type LoadState<T> = { loading: boolean; error: string; data: T | null; reload: () => Promise<void> };

function useAuthedOrders(): LoadState<AccountOrder[]> & { signedIn: boolean } {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AccountOrder[] | null>(null);

  const reload = useCallback(async () => {
    if (!auth.session) { setLoading(false); setData(null); return; }
    setLoading(true); setError("");
    try { setData((await getAccountOrders(auth.session.access_token)).orders); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Orders could not be loaded."); }
    finally { setLoading(false); }
  }, [auth.session]);

  useEffect(() => { void reload(); }, [reload]);
  return { loading, error, data, reload, signedIn: Boolean(auth.session) };
}

function useAuthedOrder(orderNumber?: string): LoadState<AccountOrder> & { signedIn: boolean; accessToken?: string } {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AccountOrder | null>(null);

  const reload = useCallback(async () => {
    if (!auth.session || !orderNumber) { setLoading(false); setData(null); return; }
    setLoading(true); setError("");
    try { setData((await getAccountOrder(auth.session.access_token, orderNumber)).order); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Order could not be loaded."); }
    finally { setLoading(false); }
  }, [auth.session, orderNumber]);

  useEffect(() => { void reload(); }, [reload]);
  return { loading, error, data, reload, signedIn: Boolean(auth.session), accessToken: auth.session?.access_token };
}

function RequireSignIn({ navigation, testID = "H062" }: { navigation: Nav; testID?: string }) {
  return (
    <HidiScreen testID={testID} contentStyle={styles.zero}>
      <AppHeader title="My orders" onBack={navigation.goBack} />
      <View style={styles.body}>
        <EmptyState title="Find your HIDI orders." body="Sign in with the verified contact used at checkout. Guest-order lookup is a separate Phase 5 flow and signing in does not delete guest purchases." action="Sign in to view orders" onAction={() => navigation.navigate("SignIn", { returnTo: "orders" })} />
      </View>
    </HidiScreen>
  );
}

function OrderLine({ item, onPress }: { item: OrderItem; onPress?: () => void }) {
  const { colors } = useHidiTheme();
  const image = orderImage(item);
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={[styles.itemRow, { borderBottomColor: colors.border }]}> 
      <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{image ? <Image source={{ uri: image }} style={styles.image} /> : null}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <HidiText variant="secondary" style={styles.bold}>{item.productName}</HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>{item.color} · Size {item.size} · Qty {item.quantity}</HidiText>
        <HidiText variant="metadata">{formatINRPaise(item.totalPaise)}</HidiText>
      </View>
      {onPress ? <ChevronRight size={18} color={colors.mutedText} /> : null}
    </Pressable>
  );
}

function SummaryRows({ order }: { order: AccountOrder }) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
      <View style={styles.totalRow}><HidiText variant="metadata">Subtotal</HidiText><HidiText variant="metadata">{formatINRPaise(order.subtotalPaise)}</HidiText></View>
      <View style={styles.totalRow}><HidiText variant="metadata">Discount</HidiText><HidiText variant="metadata">{formatINRPaise(order.discountPaise ?? 0)}</HidiText></View>
      <View style={styles.totalRow}><HidiText variant="metadata">Shipping</HidiText><HidiText variant="metadata">{formatINRPaise(order.shippingPaise ?? 0)}</HidiText></View>
      <View style={styles.totalRow}><HidiText variant="secondary" style={styles.bold}>Total</HidiText><HidiText variant="secondary" style={styles.bold}>{formatINRPaise(order.totalPaise)}</HidiText></View>
      {order.walletAppliedPaise ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>Wallet applied: {formatINRPaise(order.walletAppliedPaise)}</HidiText> : null}
    </View>
  );
}

export function MyOrdersScreen({ navigation }: ScreenProps) {
  const { colors } = useHidiTheme();
  const { loading, error, data, reload, signedIn } = useAuthedOrders();
  if (!signedIn) return <RequireSignIn navigation={navigation} />;
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error) return <HidiScreen><ErrorState message={error} onRetry={() => void reload()} /></HidiScreen>;
  if (!data?.length) {
    return <HidiScreen testID="H062"><EmptyState title="No HIDI orders yet." body="Orders placed with this verified contact will appear here. Guest order lookup is handled separately so purchases are not tied to a second account by mistake." action="Start exploring" onAction={() => navigation.navigate("MainTabs", { screen: "Shop" })} /></HidiScreen>;
  }
  const active = data.filter((order) => !["DELIVERED", "CANCELLED", "REFUNDED"].includes(String(order.status).toUpperCase()));
  const previous = data.filter((order) => !active.includes(order));
  const sections = [{ title: "Active orders", items: active }, { title: "Previous orders", items: previous }];
  return (
    <ScrollView testID="H061" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>MY ORDERS</HidiText>
      <HidiText variant="title">Your HIDI orders.</HidiText>
      {sections.map((section) => section.items.length ? <View key={section.title} style={styles.section}> 
        <HidiText variant="secondary" style={styles.bold}>{section.title}</HidiText>
        {section.items.map((order) => (
          <Pressable key={order.orderNumber} accessibilityRole="button" onPress={() => navigation.navigate("OrderDetail", { orderNumber: order.orderNumber })} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            <View style={styles.totalRow}><HidiText variant="secondary" style={styles.bold}>{order.orderNumber}</HidiText><HidiText variant="metadata">{formatStatus(order.status)}</HidiText></View>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{shortDate(order.createdAt)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}</HidiText>
            <HidiText variant="secondary">{formatINRPaise(order.totalPaise)}</HidiText>
            {order.afterSales ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>After-sales: {formatStatus(order.afterSales.status)}</HidiText> : null}
          </Pressable>
        ))}
      </View> : null)}
    </ScrollView>
  );
}

export function OrderDetailScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload, signedIn } = useAuthedOrder(orderNumber);
  if (!signedIn) return <RequireSignIn navigation={navigation} testID="H063" />;
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Order unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const delivered = String(order.status).toUpperCase() === "DELIVERED";
  return (
    <ScrollView testID="H063" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content}>
      <AppHeader title="Order detail" onBack={navigation.goBack} />
      <HidiText variant="title">Order {order.orderNumber}</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{formatStatus(order.status)} · placed {shortDate(order.createdAt)}</HidiText>
      <MessageCard>{order.paymentStatus ? "Payment state: " + formatStatus(order.paymentStatus) : "Payment state is not exposed on this order summary."}</MessageCard>
      <View style={styles.section}>{order.items.map((item) => <OrderLine key={item.id} item={item} onPress={() => navigation.navigate("ProductDeferred", { slug: item.slug })} />)}</View>
      <SummaryRows order={order} />
      <View style={styles.actionList}>
        {order.shipment ? <HidiButton label="Track package" onPress={() => navigation.navigate("TrackShipment", { orderNumber })} /> : null}
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SplitShipments", { orderNumber })} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>View package allocation</HidiText></Pressable>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("InvoiceReceipt", { orderNumber })} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>Invoice / receipt</HidiText></Pressable>
        {delivered ? <Pressable accessibilityRole="button" onPress={() => navigation.navigate("DeliveredOrder", { orderNumber })} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>Return, exchange or review</HidiText></Pressable> : null}
        {!delivered ? <Pressable accessibilityRole="button" onPress={() => navigation.navigate("CancelOrderItems", { orderNumber })} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>Cancellation options</HidiText></Pressable> : null}
      </View>
      <MessageCard>Actions are displayed from the current order data only. Cross-account order links are handled by the server and return no order data.</MessageCard>
    </ScrollView>
  );
}

export function TrackShipmentScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Tracking unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const shipment = order.shipment;
  return (
    <HidiScreen testID="H064" contentStyle={styles.zero}>
      <AppHeader title="Track shipment" onBack={navigation.goBack} />
      <View style={styles.body}>
        <Truck size={28} color={colors.action} />
        <HidiText variant="title">Package tracking</HidiText>
        {shipment ? <>
          <MessageCard>{shipment.provider ?? "Carrier"} {shipment.awb ? "· AWB " + shipment.awb : ""}</MessageCard>
          <View style={styles.timeline}>
            <HidiText variant="secondary" style={styles.bold}>{formatStatus(shipment.status)}</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Shipped: {shortDate(shipment.shippedAt)}</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>Delivered: {shortDate(shipment.deliveredAt)}</HidiText>
          </View>
          <MessageCard>Tracking events are shown only when received from the order API. HIDI does not draw an invented courier map.</MessageCard>
          {shipment.trackingUrl ? <HidiButton label="Open carrier tracking" onPress={() => void Linking.openURL(String(shipment.trackingUrl))} /> : null}
          {String(shipment.status ?? "").toUpperCase().includes("FAILED") ? <HidiButton label="Delivery help" onPress={() => navigation.navigate("DeliveryAttemptFailed", { orderNumber })} /> : null}
        </> : <MessageCard>No shipment reference is available yet. Check again after dispatch.</MessageCard>}
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("OrderDetail", { orderNumber })}><HidiText variant="metadata" style={{ color: colors.action }}>View order details</HidiText></Pressable>
      </View>
    </HidiScreen>
  );
}

export function SplitShipmentsScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Package allocation unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  return (
    <HidiScreen testID="H065" contentStyle={styles.zero}>
      <AppHeader title="Split shipments" onBack={navigation.goBack} />
      <View style={styles.body}>
        <PackageCheck size={28} color={colors.action} />
        <HidiText variant="title">Package allocation</HidiText>
        <MessageCard>The current account order API exposes one shipment summary, not item-level fulfillment groups. The app therefore cannot claim Package 1 of 2 unless the server returns those groups.</MessageCard>
        {order.items.map((item) => <OrderLine key={item.id} item={item} />)}
        {order.shipment ? <HidiButton label="Track package" onPress={() => navigation.navigate("TrackShipment", { orderNumber })} /> : null}
      </View>
    </HidiScreen>
  );
}

export function DeliveryAttemptFailedScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { data: order, loading, error, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Delivery status unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  return (
    <HidiScreen testID="H066" contentStyle={styles.zero}>
      <AppHeader title="Delivery attempt failed" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Delivery help</HidiText>
        <MessageCard>The current order API does not expose a carrier exception reason or reschedule endpoint. HIDI will not promise a reschedule slot without carrier support.</MessageCard>
        {order.shipment ? <HidiText variant="secondary">Carrier status: {formatStatus(order.shipment.status)}</HidiText> : null}
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("OrderDetail", { orderNumber })}><HidiText variant="metadata" style={{ color: colors.action }}>Back to order</HidiText></Pressable>
      </View>
    </HidiScreen>
  );
}

export function CancelOrderItemsScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { data: order, loading, error, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Cancellation unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  return (
    <HidiScreen testID="H067" contentStyle={styles.zero}>
      <AppHeader title="Cancel order items" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Cancellation options</HidiText>
        <MessageCard tone="error">The current account API does not expose order-item cancellation. The app keeps your order unchanged instead of pretending a cancellation was requested.</MessageCard>
        {order.items.map((item) => <OrderLine key={item.id} item={item} />)}
        <HidiButton label="View order" onPress={() => navigation.navigate("OrderDetail", { orderNumber })} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("CancellationResult", { orderNumber, status: "UNAVAILABLE", message: "Cancellation is not currently available online." })}><HidiText variant="metadata" style={{ color: colors.action }}>Why can’t I cancel?</HidiText></Pressable>
      </View>
    </HidiScreen>
  );
}

export function CancellationResultScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  return (
    <HidiScreen testID="H068" contentStyle={styles.zero}>
      <AppHeader title="Cancellation result" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">{formatStatus(String(route.params?.status ?? "UNAVAILABLE"))}</HidiText>
        <MessageCard>{String(route.params?.message ?? "No cancellation was created.")}</MessageCard>
        <HidiButton label="View order" onPress={() => navigation.navigate("OrderDetail", { orderNumber })} />
      </View>
    </HidiScreen>
  );
}

export function InvoiceReceiptScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  return (
    <HidiScreen testID="H069" contentStyle={styles.zero}>
      <AppHeader title="Invoice / receipt" onBack={navigation.goBack} />
      <View style={styles.body}>
        <FileText size={28} color={useHidiTheme().colors.action} />
        <HidiText variant="title">Invoice not generated in app yet.</HidiText>
        <MessageCard>The current account API does not expose a short-lived authorized invoice URL. Order support remains available; invoice failure must not block support.</MessageCard>
        <HidiButton label="Back to order" onPress={() => navigation.navigate("OrderDetail", { orderNumber })} />
      </View>
    </HidiScreen>
  );
}

export function DeliveredOrderScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Delivered order unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  return (
    <ScrollView testID="H070" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.content}>
      <AppHeader title="Delivered order" onBack={navigation.goBack} />
      <HidiText variant="title">Delivered items</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Delivered {shortDate(order.deliveredAt)} · return window ends {shortDate(order.returnWindowEndsAt)}</HidiText>
      {order.items.map((item) => <View key={item.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
        <OrderLine item={item} />
        <View style={styles.inlineActions}>
          {item.returnableQuantity > 0 && order.canReturnOrExchange ? <Pressable onPress={() => navigation.navigate("SelectReturnItems", { orderNumber, mode: "RETURN" })} style={styles.action}><HidiText variant="metadata" style={{ color: colors.action }}>Return</HidiText></Pressable> : null}
          {item.returnableQuantity > 0 && order.canReturnOrExchange ? <Pressable onPress={() => navigation.navigate("ExchangeSize", { orderNumber, orderItemId: item.id, quantity: 1 })} style={styles.action}><HidiText variant="metadata" style={{ color: colors.action }}>Exchange</HidiText></Pressable> : null}
          {!item.review ? <Pressable onPress={() => navigation.navigate("WriteReview", { orderNumber, orderItemId: item.id })} style={styles.action}><HidiText variant="metadata" style={{ color: colors.action }}>Review</HidiText></Pressable> : <HidiText variant="metadata" style={{ color: colors.mutedText }}>Reviewed</HidiText>}
        </View>
      </View>)}
      {!order.canReturnOrExchange ? <MessageCard>The server says this order is not currently eligible for return or exchange. Policy dates and line eligibility come from the order snapshot, not the device clock.</MessageCard> : null}
    </ScrollView>
  );
}

export function SelectReturnItemsScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const mode = (route.params?.mode === "EXCHANGE" ? "EXCHANGE" : "RETURN") as AfterSalesType;
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload } = useAuthedOrder(orderNumber);
  const eligible = useMemo(() => order ? eligibleReturnItems(order) : [], [order]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  useEffect(() => { if (!itemId && eligible[0]) setItemId(eligible[0].id); }, [eligible, itemId]);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Eligibility unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  if (!eligible.length) return <ReturnUnavailableScreen navigation={navigation} route={{ params: { orderNumber, reason: "No delivered quantity is eligible for a new return or exchange." } }} />;
  const selected = eligible.find((item) => item.id === itemId) ?? eligible[0];
  return (
    <HidiScreen testID="H071" contentStyle={styles.zero}>
      <AppHeader title="Select return items" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Choose eligible units.</HidiText>
        {eligible.map((item) => <Pressable key={item.id} onPress={() => { setItemId(item.id); setQuantity(1); }} style={[styles.card, { borderColor: item.id === selected.id ? colors.action : colors.border, backgroundColor: colors.surface }]}> 
          <OrderLine item={item} />
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>{item.returnableQuantity} unit(s) remain eligible</HidiText>
        </Pressable>)}
        <View style={styles.inlineActions}><Pressable onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.action}><HidiText>-</HidiText></Pressable><HidiText variant="secondary">Qty {quantity}</HidiText><Pressable onPress={() => setQuantity(Math.min(selected.returnableQuantity, quantity + 1))} style={styles.action}><HidiText>+</HidiText></Pressable></View>
        <MessageCard>{mode === "EXCHANGE" ? "Exchange and return stay distinct; selected units are not reserved until final review." : "Already-returned or active-return units cannot be selected again."}</MessageCard>
        <HidiButton label="Continue" onPress={() => mode === "EXCHANGE" ? navigation.navigate("ExchangeSize", { orderNumber, orderItemId: selected.id, quantity }) : navigation.navigate("ReturnReason", { orderNumber, orderItemId: selected.id, quantity, type: mode })} />
      </View>
    </HidiScreen>
  );
}

export function ReturnReasonScreen({ navigation, route }: ScreenProps) {
  const { colors } = useHidiTheme();
  const [reason, setReason] = useState("SIZE_FIT");
  const [detail, setDetail] = useState("");
  const draft: AfterSalesDraft = { orderNumber: String(route.params?.orderNumber), orderItemId: String(route.params?.orderItemId), quantity: Number(route.params?.quantity ?? 1), type: route.params?.type === "EXCHANGE" ? "EXCHANGE" : "RETURN", reason, detail };
  return (
    <HidiScreen testID="H072" contentStyle={styles.zero}>
      <AppHeader title="Return reason" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Tell us what happened.</HidiText>
        {RETURN_REASONS.map((item) => <Pressable key={item.code} onPress={() => setReason(item.code)} style={[styles.choice, { borderColor: reason === item.code ? colors.action : colors.border }]}><HidiText variant="secondary">{item.label}</HidiText></Pressable>)}
        <HidiField label="Details (optional)" value={detail} onChangeText={setDetail} multiline />
        <HidiButton label="Continue" onPress={() => navigation.navigate("ReturnEvidence", { draft })} />
      </View>
    </HidiScreen>
  );
}

export function ReturnEvidenceScreen({ navigation, route }: ScreenProps) {
  const draft = route.params?.draft as AfterSalesDraft;
  return (
    <HidiScreen testID="H073" contentStyle={styles.zero}>
      <AppHeader title="Return evidence" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Evidence</HidiText>
        <MessageCard>{evidenceRequired(draft.reason) ? "This reason may require evidence, but the current frontend has no approved upload/presign contract wired here. Continue only if support can request evidence later." : "No photo is required for this reason."}</MessageCard>
        <MessageCard>Do not upload personal documents or faces unless HIDI support explicitly asks through an approved upload flow.</MessageCard>
        <HidiButton label="Continue" onPress={() => navigation.navigate("ReturnPickup", { draft })} />
      </View>
    </HidiScreen>
  );
}

export function ReturnPickupScreen({ navigation, route }: ScreenProps) {
  const draft = route.params?.draft as AfterSalesDraft;
  return (
    <HidiScreen testID="H074" contentStyle={styles.zero}>
      <AppHeader title="Return pickup" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Pickup method</HidiText>
        <MessageCard>The current account API creates the request first and operations/carrier then update pickup state. No pickup slot is fabricated at draft time.</MessageCard>
        <HidiButton label="Review return" onPress={() => navigation.navigate("ReviewReturn", { draft })} />
      </View>
    </HidiScreen>
  );
}

export function ReviewReturnScreen({ navigation, route }: ScreenProps) {
  const auth = useAuth();
  const draft = route.params?.draft as AfterSalesDraft;
  const [destination, setDestination] = useState<"ORIGINAL" | "WALLET">("ORIGINAL");
  const [error, setError] = useState("");
  async function submit() {
    if (!auth.session) { navigation.navigate("SignIn", { returnTo: "orders" }); return; }
    setError("");
    try {
      const created = await createAfterSalesRequest(auth.session.access_token, { ...draft, refundDestination: draft.type === "RETURN" ? destination : undefined });
      navigation.replace("ReturnTracking", { orderNumber: draft.orderNumber, requestId: created.id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request could not be created."); }
  }
  return (
    <HidiScreen testID="H075" contentStyle={styles.zero}>
      <AppHeader title="Review return" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Review request</HidiText>
        <MessageCard>{draft.type} · Qty {draft.quantity} · {formatStatus(draft.reason)}</MessageCard>
        {draft.type === "RETURN" ? <View style={styles.inlineActions}><Pressable onPress={() => setDestination("ORIGINAL")} style={styles.action}><HidiText>Original</HidiText></Pressable><Pressable onPress={() => setDestination("WALLET")} style={styles.action}><HidiText>Wallet</HidiText></Pressable></View> : null}
        <MessageCard>Final eligibility is checked by the server. A duplicate tap returns one tracked request rather than a second customer promise.</MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Request return" onPress={() => void submit()} />
      </View>
    </HidiScreen>
  );
}

export function ReturnTrackingScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const requestId = String(route.params?.requestId ?? "");
  const { colors } = useHidiTheme();
  const { loading, error, data: order, reload, accessToken } = useAuthedOrder(orderNumber);
  const [actionError, setActionError] = useState("");
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Return request unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const entry = findRequest(order, requestId);
  const request = entry?.request;
  async function cancel() {
    if (!accessToken || !request) return;
    setActionError("");
    try { await cancelAfterSalesRequest(accessToken, orderNumber, request.id); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Request could not be cancelled."); }
  }
  return (
    <HidiScreen testID="H076" contentStyle={styles.zero}>
      <AppHeader title="Return tracking" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">{request ? formatStatus(request.type) : "Request"} status</HidiText>
        {request ? <>
          <MessageCard>{formatStatus(request.status)} · requested {shortDate(request.createdAt)}</MessageCard>
          <OrderLine item={entry.item} />
          <View style={styles.timeline}><HidiText variant="metadata">Requested</HidiText><HidiText variant="metadata">Approved / picked up / inspected only when server records those events.</HidiText><HidiText variant="metadata">Completed: {shortDate(request.completedAt)}</HidiText></View>
          {request.pickupTrackingUrl ? <HidiButton label="Open pickup tracking" onPress={() => void Linking.openURL(String(request.pickupTrackingUrl))} /> : null}
          {String(request.status).includes("PICKUP") ? <Pressable onPress={() => navigation.navigate("ReturnPickupMissed", { orderNumber, requestId: request.id })} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>Pickup help</HidiText></Pressable> : null}
          {request.type === "RETURN" ? <HidiButton label="View refund status" onPress={() => needsRefundAttention(request) ? navigation.navigate("RefundNeedsAttention", { orderNumber, requestId: request.id }) : navigation.navigate(request.status === "REFUNDED" ? "RefundCompleted" : "RefundInProgress", { orderNumber, requestId: request.id })} /> : null}
          {request.status === "REQUESTED" ? <Pressable onPress={() => void cancel()} style={styles.secondary}><HidiText variant="metadata" style={{ color: colors.action }}>Cancel request</HidiText></Pressable> : null}
          {actionError ? <MessageCard tone="error">{actionError}</MessageCard> : null}
        </> : <MessageCard>This return or exchange request is no longer available on the order.</MessageCard>}
      </View>
    </HidiScreen>
  );
}

export function RefundInProgressScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { data: order, loading, error, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Refund status unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const entry = findRequest(order, String(route.params?.requestId ?? ""));
  return (
    <HidiScreen testID="H077" contentStyle={styles.zero}>
      <AppHeader title="Refund in progress" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Refund status</HidiText>
        <MessageCard>Amount: {formatINRPaise(requestAmountPaise(entry?.request))}. Status: {formatStatus(entry?.request?.refundStatus ?? entry?.request?.status)}.</MessageCard>
        <MessageCard>HIDI labels initiated, processing and processed according to server/provider evidence. No fixed bank settlement time is promised.</MessageCard>
        <HidiButton label="View order" onPress={() => navigation.navigate("OrderDetail", { orderNumber })} />
      </View>
    </HidiScreen>
  );
}

export function RefundCompletedScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const { data: order, loading, error, reload } = useAuthedOrder(orderNumber);
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Refund status unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const entry = findRequest(order, String(route.params?.requestId ?? ""));
  return (
    <HidiScreen testID="H078" contentStyle={styles.zero}>
      <AppHeader title="Refund completed" onBack={navigation.goBack} />
      <View style={styles.body}>
        <BadgeCheck size={30} color={useHidiTheme().colors.success} />
        <HidiText variant="title">Refund processed.</HidiText>
        <MessageCard>{formatINRPaise(requestAmountPaise(entry?.request))} · {formatStatus(entry?.request?.refundStatus ?? entry?.request?.status)}. Provider processed does not necessarily mean instantly visible in your bank.</MessageCard>
        <HidiButton label="View order" onPress={() => navigation.navigate("OrderDetail", { orderNumber })} />
      </View>
    </HidiScreen>
  );
}

export function ExchangeSizeScreen({ navigation, route }: ScreenProps) {
  const orderNumber = String(route.params?.orderNumber ?? "");
  const orderItemId = String(route.params?.orderItemId ?? "");
  const quantity = Number(route.params?.quantity ?? 1);
  const { colors } = useHidiTheme();
  const { data: order, loading, error, reload } = useAuthedOrder(orderNumber);
  const [size, setSize] = useState("");
  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !order) return <HidiScreen><ErrorState message={error || "Exchange options unavailable."} onRetry={() => void reload()} /></HidiScreen>;
  const item = order.items.find((line) => line.id === orderItemId);
  const sizes = (item?.exchangeSizes ?? []).filter((value) => value && value !== item?.size);
  if (!item || !sizes.length) return <ReturnUnavailableScreen navigation={navigation} route={{ params: { orderNumber, reason: "No replacement size is currently exposed by the order API." } }} />;
  const chosen = size || sizes[0];
  return (
    <HidiScreen testID="H079" contentStyle={styles.zero}>
      <AppHeader title="Exchange size" onBack={navigation.goBack} />
      <View style={styles.body}>
        <OrderLine item={item} />
        <HidiText variant="title">Choose replacement size.</HidiText>
        <View style={styles.inlineActions}>{sizes.map((value) => <Pressable key={value} onPress={() => setSize(value)} style={[styles.choice, { borderColor: chosen === value ? colors.action : colors.border }]}><HidiText>{value}</HidiText></Pressable>)}</View>
        <MessageCard>Replacement inventory is checked by the server at confirmation, not at selection.</MessageCard>
        <HidiButton label="Review exchange" onPress={() => navigation.navigate("ExchangeReview", { orderNumber, orderItemId, quantity, requestedSize: chosen })} />
      </View>
    </HidiScreen>
  );
}

export function ExchangeReviewScreen({ navigation, route }: ScreenProps) {
  const auth = useAuth();
  const orderNumber = String(route.params?.orderNumber ?? "");
  const orderItemId = String(route.params?.orderItemId ?? "");
  const requestedSize = String(route.params?.requestedSize ?? "");
  const quantity = Number(route.params?.quantity ?? 1);
  const [error, setError] = useState("");
  async function submit() {
    if (!auth.session) { navigation.navigate("SignIn", { returnTo: "orders" }); return; }
    setError("");
    try {
      const created = await createAfterSalesRequest(auth.session.access_token, { orderNumber, orderItemId, quantity, type: "EXCHANGE", reason: "SIZE_FIT", requestedSize });
      navigation.replace("ReturnTracking", { orderNumber, requestId: created.id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Exchange could not be created."); }
  }
  return (
    <HidiScreen testID="H080" contentStyle={styles.zero}>
      <AppHeader title="Exchange review" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Review exchange</HidiText>
        <MessageCard>Outgoing quantity {quantity}; replacement size {requestedSize}. Price-difference quotes are not exposed by the current API.</MessageCard>
        <Pressable onPress={() => navigation.navigate("ExchangePriceDifference", { orderNumber, orderItemId, requestedSize })} style={styles.secondary}><HidiText variant="metadata">About price differences</HidiText></Pressable>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Confirm exchange" onPress={() => void submit()} />
      </View>
    </HidiScreen>
  );
}

export function ReturnUnavailableScreen({ navigation, route }: ScreenProps) {
  return (
    <HidiScreen testID="H081" contentStyle={styles.zero}>
      <AppHeader title="Return unavailable" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">This line is not eligible online.</HidiText>
        <MessageCard>{String(route.params?.reason ?? "The current server eligibility rules do not allow a new return or exchange for this line.")}</MessageCard>
        <HidiButton label="View order" onPress={() => navigation.navigate("OrderDetail", { orderNumber: String(route.params?.orderNumber ?? "") })} />
      </View>
    </HidiScreen>
  );
}

export function WriteReviewScreen({ navigation, route }: ScreenProps) {
  const auth = useAuth();
  const orderNumber = String(route.params?.orderNumber ?? "");
  const orderItemId = String(route.params?.orderItemId ?? "");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  async function submit() {
    if (!auth.session) { navigation.navigate("SignIn", { returnTo: "orders" }); return; }
    setError("");
    try { await submitOrderReview(auth.session.access_token, orderNumber, orderItemId, { rating, title, body }); navigation.replace("DeliveredOrder", { orderNumber }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be submitted."); }
  }
  return (
    <HidiScreen testID="H082" contentStyle={styles.zero}>
      <AppHeader title="Write a review" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Share your experience.</HidiText>
        <View style={styles.inlineActions}>{[1,2,3,4,5].map((value) => <Pressable key={value} onPress={() => setRating(value)} style={styles.action}><HidiText variant="title">{value <= rating ? "★" : "☆"}</HidiText></Pressable>)}</View>
        <HidiField label="Title (optional)" value={title} onChangeText={setTitle} />
        <HidiField label="Review" value={body} onChangeText={setBody} multiline />
        <MessageCard>Reviews are moderated. No incentive is offered for positive-only ratings.</MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Submit review" onPress={() => void submit()} />
      </View>
    </HidiScreen>
  );
}

export function CodRefundDestinationScreen({ navigation, route }: ScreenProps) {
  return (
    <HidiScreen testID="H128" contentStyle={styles.zero}>
      <AppHeader title="COD refund destination" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Secure refund destination</HidiText>
        <MessageCard tone="error">A provider-owned payout/tokenization surface is not exposed in the current app contract. HIDI will not ask for bank PINs, OTPs or CVV in this screen.</MessageCard>
        <HidiButton label="Back to review" onPress={() => navigation.navigate("ReviewReturn", { draft: route.params?.draft })} />
      </View>
    </HidiScreen>
  );
}

export function ReturnPickupMissedScreen({ navigation, route }: ScreenProps) {
  return (
    <HidiScreen testID="H129" contentStyle={styles.zero}>
      <AppHeader title="Return pickup missed" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Pickup help</HidiText>
        <MessageCard>The current return request does not expose a carrier-supported retry slot. Refund state remains separate from pickup state.</MessageCard>
        <HidiButton label="Back to return tracking" onPress={() => navigation.navigate("ReturnTracking", { orderNumber: String(route.params?.orderNumber ?? ""), requestId: String(route.params?.requestId ?? "") })} />
      </View>
    </HidiScreen>
  );
}

export function ExchangePriceDifferenceScreen({ navigation, route }: ScreenProps) {
  return (
    <HidiScreen testID="H130" contentStyle={styles.zero}>
      <AppHeader title="Exchange price difference" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Price difference</HidiText>
        <MessageCard>The current exchange API accepts an eligible replacement size but does not expose a separate exchange quote or payable difference. If a positive difference is later required, it must use the standard safe payment flow.</MessageCard>
        <HidiButton label="Back to exchange" onPress={() => navigation.goBack()} />
      </View>
    </HidiScreen>
  );
}

export function RefundNeedsAttentionScreen({ navigation, route }: ScreenProps) {
  return (
    <HidiScreen testID="H131" contentStyle={styles.zero}>
      <AppHeader title="Refund needs attention" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Refund support needed</HidiText>
        <MessageCard>Refund status is delayed, failed or requires a verified destination. HIDI support must retry with an idempotent operation and finance audit; this screen does not invite a repeat purchase.</MessageCard>
        <HidiButton label="Back to return tracking" onPress={() => navigation.navigate("ReturnTracking", { orderNumber: String(route.params?.orderNumber ?? ""), requestId: String(route.params?.requestId ?? "") })} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  content: { padding: 20, paddingBottom: 42, gap: 14 },
  body: { padding: 22, gap: 14 },
  section: { gap: 10, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: hidiRadius.card, padding: 14, gap: 8 },
  itemRow: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  thumb: { width: 58, height: 74, borderRadius: hidiRadius.control, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  bold: { fontWeight: "600" },
  actionList: { gap: 6 },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  action: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  choice: { borderWidth: 1, borderRadius: hidiRadius.control, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  timeline: { gap: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#DED5D2" },
});
