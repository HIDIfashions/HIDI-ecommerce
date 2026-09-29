import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Truck } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { checkDelivery } from "../../data/productDetail";
import { checkoutStorage } from "../../storage/checkoutStorage";
import type { CheckoutAddress, DeliverySelection } from "../../models/checkout";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "DeliveryOptions">;

export default function DeliveryOptionsScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [delivery, setDelivery] = useState<DeliverySelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const selected = await checkoutStorage.selectedAddress();
      if (!selected) {
        navigation.replace("AddAddress");
        return;
      }
      setAddress(selected);
      const result = await checkDelivery(selected.postalCode);
      if (!result.serviceable) {
        navigation.replace("AddressUnavailable", { pin: selected.postalCode });
        return;
      }
      const next: DeliverySelection = {
        methodId: "standard",
        label: "Standard delivery",
        serviceable: true,
        pin: result.pin,
        city: result.city,
        stateCode: result.stateCode,
        feePaise: 0,
        checkedAt: Date.now(),
      };
      setDelivery(next);
      await checkoutStorage.saveDelivery(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery options could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error) return <HidiScreen><ErrorState message={error} onRetry={() => void load()} /></HidiScreen>;

  return (
    <HidiScreen testID="H050" contentStyle={styles.zero}>
      <AppHeader title="Delivery options" onBack={navigation.goBack} />
      <View style={styles.body}>
        <Truck size={30} color={colors.action} />
        <HidiText variant="title">Choose delivery.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Only eligible delivery methods are shown. Paid upgrades are never preselected.</HidiText>
        {address ? <MessageCard>Delivering to PIN {address.postalCode}{delivery?.city ? " · " + delivery.city : ""}</MessageCard> : null}
        {delivery ? (
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: true }} style={[styles.option, { borderColor: colors.action, backgroundColor: colors.surface }]}> 
            <View style={{ flex: 1 }}>
              <HidiText variant="secondary" style={styles.bold}>{delivery.label}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>Carrier serviceability is available. Delivery range and fee are finalized by the current backend at checkout/order creation.</HidiText>
            </View>
            <HidiText variant="secondary" style={{ color: colors.action }}>Selected</HidiText>
          </Pressable>
        ) : null}
        <MessageCard>The existing serviceability API validates the PIN only; it does not return per-SKU delivery range, COD eligibility, split-shipment rules or fees. Those values are not invented in this app.</MessageCard>
        <HidiButton label="Continue to review order" disabled={!delivery} onPress={() => navigation.navigate("ReviewOrder")} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  option: { minHeight: 88, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  bold: { fontWeight: "600" },
});
