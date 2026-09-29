import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { checkoutStorage } from "../../storage/checkoutStorage";
import type { CheckoutAddress } from "../../models/checkout";
import { hasAddressErrors, normalizeCheckoutPhone, validateCheckoutAddress } from "../../models/checkout";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddAddress">;

type Draft = Omit<CheckoutAddress, "id" | "countryCode">;

const initial: Draft = {
  firstName: "",
  lastName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Telangana",
  postalCode: "",
  isDefault: true,
};

export default function AddAddressScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const [draft, setDraft] = useState<Draft>(initial);
  const [savedError, setSavedError] = useState("");

  useEffect(() => {
    void checkoutStorage.contact().then((contact) => {
      if (contact?.phone) setDraft((before) => ({ ...before, phone: contact.phone }));
    });
  }, []);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((before) => ({ ...before, [key]: value }));
    setSavedError("");
  }

  async function save() {
    const normalizedPhone = normalizeCheckoutPhone(draft.phone);
    const candidate: CheckoutAddress = {
      id: "addr-" + Date.now().toString(36),
      ...draft,
      phone: normalizedPhone ?? draft.phone,
      countryCode: "IN",
    };
    const errors = validateCheckoutAddress(candidate);
    if (hasAddressErrors(errors)) {
      navigation.navigate("AddressErrors", { errors, draft: candidate });
      return;
    }
    try {
      await checkoutStorage.upsertAddress(candidate);
      await checkoutStorage.clearDelivery();
      navigation.navigate("CheckoutAddress");
    } catch {
      setSavedError("This address could not be saved on this device. Your entered details remain here.");
    }
  }

  return (
    <HidiScreen testID="H047" contentStyle={styles.zero}>
      <AppHeader title="Add delivery address" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">Add a delivery address.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>PIN may suggest serviceability later, but city and state remain visible and editable.</HidiText>
        <HidiField label="Recipient first name" value={draft.firstName} onChangeText={(value) => setField("firstName", value)} autoCapitalize="words" />
        <HidiField label="Last name (optional)" value={draft.lastName} onChangeText={(value) => setField("lastName", value)} autoCapitalize="words" />
        <HidiField label="Mobile number" value={draft.phone} onChangeText={(value) => setField("phone", value)} keyboardType="phone-pad" />
        <HidiField label="House / flat / street" value={draft.line1} onChangeText={(value) => setField("line1", value)} />
        <HidiField label="Area / locality (optional)" value={draft.line2} onChangeText={(value) => setField("line2", value)} />
        <HidiField label="Landmark (optional)" value={draft.landmark} onChangeText={(value) => setField("landmark", value)} />
        <HidiField label="PIN code" value={draft.postalCode} onChangeText={(value) => setField("postalCode", value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} />
        <HidiField label="City" value={draft.city} onChangeText={(value) => setField("city", value)} autoCapitalize="words" />
        <HidiField label="State" value={draft.state} onChangeText={(value) => setField("state", value)} autoCapitalize="words" />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(draft.isDefault) }} onPress={() => setField("isDefault", !draft.isDefault)} style={styles.defaultRow}>
          <HidiText variant="secondary" style={{ color: colors.action }}>{draft.isDefault ? "✓" : "○"}</HidiText>
          <HidiText variant="secondary">Use as default address on this device</HidiText>
        </Pressable>
        {savedError ? <MessageCard tone="error">{savedError}</MessageCard> : null}
        <HidiButton label="Save address" onPress={() => void save()} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 13 },
  defaultRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
});
