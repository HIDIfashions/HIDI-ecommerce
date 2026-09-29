import React, { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BellOff } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useProductDetail } from "../../data/useProductDetail";
import { setWishlistDesired } from "../../data/wishlistStore";
import { formatINRPaise, productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "StockAlert">;

export default function StockAlertScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);
  const [saved, setSaved] = useState(false);
  const variant = useMemo(() => product?.variants.find((item) => item.id === route.params.variantId), [product, route.params.variantId]);

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error || !product || !variant) return <HidiScreen><ErrorState message={error || "This size is no longer available."} onRetry={() => void reload()} /></HidiScreen>;

  async function saveStyle() {
    const list = await setWishlistDesired(product!.slug, true, { pricePaise: product!.minPricePaise, inStock: product!.inStock });
    setSaved(list.includes(product!.slug));
  }

  return (
    <HidiScreen testID="H033" contentStyle={styles.zero}>
      <AppHeader title="Back-in-stock alert" onBack={navigation.goBack} />
      <View style={styles.body}>
        <View style={styles.productRow}>
          <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{productImage(product) ? <Image source={{ uri: productImage(product) }} style={styles.image} /> : null}</View>
          <View style={{ flex: 1 }}>
            <HidiText variant="secondary" style={styles.bold}>{product.name}</HidiText>
            <HidiText variant="metadata">{variant.color} · Size {variant.size}</HidiText>
            <HidiText variant="secondary">{formatINRPaise(variant.pricePaise)}</HidiText>
          </View>
        </View>

        <View style={[styles.icon, { backgroundColor: colors.blush }]}><BellOff size={28} color={colors.action} /></View>
        <HidiText variant="title">Availability alerts aren’t connected yet.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>
          The current HIDI customer API does not expose the blueprint’s stock-alert subscription endpoint or a verified alert destination. HIDI will not pretend an alert was scheduled.
        </HidiText>
        <MessageCard>This screen does not opt you into promotional messages. Saving the style is local shopping intent, not marketing consent.</MessageCard>
        <HidiButton label={saved ? "Saved" : "Save this style instead"} disabled={saved} onPress={() => void saveStyle()} />
        <HidiButton label="Back to size choices" onPress={() => navigation.navigate("VariantPicker", { slug: product.slug })} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  productRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 92, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  bold: { fontWeight: "600" },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: 8 },
});
