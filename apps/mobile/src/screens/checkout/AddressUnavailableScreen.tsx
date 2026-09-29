import React from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MapPinOff } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useCart } from "../../data/CartContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddressUnavailable">;

export default function AddressUnavailableScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { cart } = useCart();
  return (
    <HidiScreen testID="H049" contentStyle={styles.zero}>
      <AppHeader title="Address unavailable" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><MapPinOff size={30} color={colors.action} /></View>
        <HidiText variant="title">We can’t ship there right now.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>PIN {route.params.pin} is not serviceable from the current carrier response.</HidiText>
        <MessageCard>Nothing was removed from your bag. HIDI will not silently drop lines or create a partial order without your approval.</MessageCard>
        {cart?.items.map((line) => (
          <View key={line.id} style={[styles.line, { borderBottomColor: colors.border }]}> 
            <HidiText variant="secondary" style={styles.bold}>{line.product.name}</HidiText>
            <HidiText variant="metadata" style={{ color: colors.mutedText }}>{line.variant.color} · Size {line.variant.size} · Qty {line.quantity}</HidiText>
          </View>
        ))}
        <HidiButton label="Choose another address" onPress={() => navigation.navigate("CheckoutAddress")} />
        <HidiButton label="Review bag" onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 14 },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  line: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  bold: { fontWeight: "600" },
});
