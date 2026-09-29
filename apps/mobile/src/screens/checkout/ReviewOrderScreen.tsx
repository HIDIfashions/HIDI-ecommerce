import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { useCart } from "../../data/CartContext";
import { formatINRPaise } from "../../models/product";
import type { CheckoutAddress, CheckoutContact, DeliverySelection } from "../../models/checkout";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";
import { AddressSummary, CheckoutLine, ContactSummary, DeliverySummary, MoneyRow, RowLink, SectionCard } from "./CheckoutSupport";

type Props = NativeStackScreenProps<RootStackParamList, "ReviewOrder">;

export default function ReviewOrderScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const cartState = useCart();
  const [contact, setContact] = useState<CheckoutContact | null>(null);
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [delivery, setDelivery] = useState<DeliverySelection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([checkoutStorage.contact(), checkoutStorage.selectedAddress(), checkoutStorage.delivery()]).then(([c, a, d]) => {
      setContact(c); setAddress(a); setDelivery(d); setLoading(false);
    });
  }, []);

  const cart = cartState.cart;
  const blocked = Boolean(cartState.stale || cartState.attention.length || cart?.items.some((line) => line.variant.available < line.quantity));

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (!cart || !cart.items.length) return <HidiScreen><ErrorState message="Your bag is empty. Add an item before reviewing checkout." onRetry={() => navigation.navigate("MainTabs", { screen: "Bag" })} /></HidiScreen>;
  if (!contact) return <HidiScreen><ErrorState message="Checkout contact is missing." onRetry={() => navigation.replace("CheckoutContact")} /></HidiScreen>;
  if (!address) return <HidiScreen><ErrorState message="Delivery address is missing." onRetry={() => navigation.replace("CheckoutAddress")} /></HidiScreen>;
  if (!delivery) return <HidiScreen><ErrorState message="Delivery option must be checked again." onRetry={() => navigation.replace("DeliveryOptions")} /></HidiScreen>;

  return (
    <HidiScreen testID="H051" contentStyle={styles.zero}>
      <AppHeader title="Review order" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Review before payment.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Payment cannot start until this app shows the same canonical bag total it sends to the server.</HidiText>
        {blocked ? <MessageCard tone="error">Your bag has stale or unresolved stock/price changes. Review the bag before creating a checkout attempt.</MessageCard> : null}
        <SectionCard><ContactSummary contact={contact} /><RowLink title="Edit contact" onPress={() => navigation.navigate("CheckoutContact")} /></SectionCard>
        <SectionCard><AddressSummary address={address} /><RowLink title="Edit address" onPress={() => navigation.navigate("CheckoutAddress")} /></SectionCard>
        <SectionCard><DeliverySummary delivery={delivery} /><RowLink title="Change delivery" onPress={() => navigation.navigate("DeliveryOptions")} /></SectionCard>
        <SectionCard>
          <HidiText variant="secondary" style={styles.bold}>Items</HidiText>
          {cart.items.map((line) => <CheckoutLine key={line.id} line={line} />)}
        </SectionCard>
        <SectionCard>
          <MoneyRow label="Server bag subtotal" value={formatINRPaise(cart.subtotalPaise)} />
          <MoneyRow label="Shipping" value="Checked at order creation" muted />
          <MoneyRow label="Promotions" value="No server promo contract" muted />
          <MoneyRow label="Payable now" value={formatINRPaise(cart.subtotalPaise)} />
        </SectionCard>
        <MessageCard>The existing backend creates the reservation/order/payment reference in one prepare call; it does not expose a separate quoteId endpoint. Phase 3 therefore creates no hidden payment attempt on this review screen.</MessageCard>
        <HidiButton label="Choose payment" disabled={blocked} onPress={() => navigation.navigate("PaymentMethods")} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 14 },
  bold: { fontWeight: "600" },
});
