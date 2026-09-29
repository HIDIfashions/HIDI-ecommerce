import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MapPin, Truck } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { checkDelivery, Serviceability } from "../../data/productDetail";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "DeliveryCheck">;

export default function DeliveryCheckScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<Serviceability | null>(null);
  const [checkError, setCheckError] = useState("");
  const [busy, setBusy] = useState(false);

  const variant = useMemo(() => product?.variants.find((item) => item.id === route.params.variantId), [product, route.params.variantId]);

  async function check() {
    setCheckError("");
    setResult(null);
    setBusy(true);
    try {
      setResult(await checkDelivery(pin));
    } catch (cause) {
      setCheckError(cause instanceof Error ? cause.message : "Delivery availability cannot be checked right now.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !product || !variant) return <HidiScreen><ErrorState message={error || "This product selection is no longer available."} onRetry={() => void reload()} /></HidiScreen>;

  if (result && !result.serviceable) {
    return (
      <HidiScreen testID="H030" contentStyle={styles.zero}>
        <AppHeader title="Not delivered here" onBack={navigation.goBack} />
        <View style={styles.center}>
          <View style={[styles.icon, { backgroundColor: colors.blush }]}><MapPin size={30} color={colors.action} /></View>
          <HidiText variant="title" style={styles.centerText}>Not here just yet.</HidiText>
          <HidiText variant="secondary" style={[styles.centerText, { color: colors.mutedText }]}>
            We can’t confirm delivery to PIN {result.pin} from the current carrier serviceability response.
          </HidiText>
          <MessageCard>Your bag and product selection are unchanged. HIDI will not promise a launch date or subscribe you to marketing.</MessageCard>
          <HidiButton label="Try another PIN" onPress={() => { setResult(null); setPin(""); }} />
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("ProductDeferred", { slug: product.slug, selectedVariantId: variant.id })}>
            <HidiText variant="secondary" style={{ color: colors.action }}>Continue browsing</HidiText>
          </Pressable>
        </View>
      </HidiScreen>
    );
  }

  return (
    <HidiScreen testID="H029" contentStyle={styles.zero}>
      <AppHeader title="Check delivery" onBack={navigation.goBack} />
      <View style={styles.body}>
        <Truck size={28} color={colors.action} />
        <HidiText variant="title">Will it reach you?</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>{product.name} · {variant.color} · Size {variant.size}</HidiText>
        <HidiField
          label="Delivery PIN code"
          value={pin}
          onChangeText={(value) => { setPin(value.replace(/\D/g, "").slice(0, 6)); setResult(null); setCheckError(""); }}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="500001"
          error={checkError}
        />
        {result?.serviceable ? (
          <MessageCard tone="success">
            Delivery service is available to {result.pin}{result.city ? " · " + result.city : ""}. Final delivery timing, charges and payment-method eligibility are checked at checkout.
          </MessageCard>
        ) : (
          <MessageCard>
            The existing serviceability API validates the PIN only. It does not currently return SKU-specific delivery dates, delivery fees or COD eligibility, so those are not invented here.
          </MessageCard>
        )}
        <HidiButton label={busy ? "Checking…" : "Check availability"} loading={busy} disabled={pin.length !== 6} onPress={() => void check()} />
        {result?.serviceable ? (
          <HidiButton label="Back to product" onPress={() => navigation.navigate("ProductDeferred", { slug: product.slug, selectedVariantId: variant.id })} />
        ) : null}
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16 },
  center: { padding: 28, gap: 16, alignItems: "center" },
  centerText: { textAlign: "center" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  secondary: { minHeight: 48, justifyContent: "center" },
});
