import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MapPin } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { checkoutStorage } from "../../storage/checkoutStorage";
import type { CheckoutAddress } from "../../models/checkout";
import { addressSummary } from "../../models/checkout";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CheckoutAddress">;

export default function CheckoutAddressScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const [addresses, setAddresses] = useState<CheckoutAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    const [items, selected] = await Promise.all([checkoutStorage.addresses(), checkoutStorage.selectedAddressId()]);
    setAddresses(items);
    setSelectedId(selected ?? items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? null);
  }

  useEffect(() => { void load(); }, []);

  async function deliverHere() {
    if (!selectedId) {
      navigation.navigate("AddAddress");
      return;
    }
    await checkoutStorage.selectAddress(selectedId);
    await checkoutStorage.clearDelivery();
    navigation.navigate("DeliveryOptions");
  }

  return (
    <HidiScreen testID="H046" contentStyle={styles.zero}>
      <AppHeader title="Choose delivery address" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Where should we deliver?</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Selecting an address rechecks serviceability before any payment action appears.</HidiText>

        {addresses.length ? addresses.map((address) => {
          const active = selectedId === address.id;
          return (
            <Pressable key={address.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setSelectedId(address.id)} style={[styles.card, { borderColor: active ? colors.action : colors.border, backgroundColor: colors.surface }]}> 
              <View style={styles.row}>
                <MapPin size={18} color={active ? colors.action : colors.mutedText} />
                <View style={{ flex: 1, gap: 4 }}>
                  <HidiText variant="secondary" style={styles.bold}>{address.firstName}{address.lastName ? " " + address.lastName : ""}</HidiText>
                  <HidiText variant="metadata" style={{ color: colors.mutedText }}>{addressSummary(address)}</HidiText>
                </View>
              </View>
            </Pressable>
          );
        }) : (
          <MessageCard>No saved delivery address on this device yet. Add one to continue.</MessageCard>
        )}

        <HidiButton label={addresses.length ? "Deliver here" : "Add delivery address"} onPress={() => void deliverHere()} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("AddAddress")}>
          <HidiText variant="secondary" style={{ color: colors.action }}>{addresses.length ? "Add new address" : "Enter address manually"}</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bold: { fontWeight: "600" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
