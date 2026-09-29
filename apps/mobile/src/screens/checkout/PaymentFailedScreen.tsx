import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { XCircle } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PaymentFailed">;

export default function PaymentFailedScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  async function retry() {
    await checkoutStorage.resetCheckoutToken();
    navigation.replace("PaymentMethods");
  }
  return (
    <HidiScreen testID="H058" contentStyle={styles.zero}>
      <AppHeader title="Payment not completed" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.blush }]}><XCircle size={30} color={colors.error} /></View>
        <HidiText variant="title">Payment wasn’t completed.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Verified terminal status: {route.params.reason}. Your bag, contact and address remain saved.</HidiText>
        <MessageCard>Ambiguous timeouts stay pending instead of coming here. A retry starts only after this saved attempt is considered terminal and a new checkout token is created.</MessageCard>
        <HidiButton label="Try another method" onPress={() => void retry()} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("ReviewOrder")}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Back to review order</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16, alignItems: "center" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, justifyContent: "center" },
});
