import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Heart } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { useProductDetail } from "../../data/useProductDetail";
import { formatINRPaise, productImage } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ProductUnavailable">;

export default function ProductUnavailableScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { product, loading, error, notFound, reload } = useProductDetail(route.params.slug);

  if (loading) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error) return <HidiScreen><ErrorState message={error} onRetry={() => void reload()} /></HidiScreen>;

  return (
    <HidiScreen testID="H034" contentStyle={styles.zero}>
      <AppHeader title="Product unavailable" onBack={navigation.goBack} />
      <View style={styles.body}>
        {product ? (
          <View style={styles.productRow}>
            <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{productImage(product) ? <Image source={{ uri: productImage(product) }} style={styles.image} /> : null}</View>
            <View style={{ flex: 1 }}>
              <HidiText variant="secondary" style={styles.bold}>{product.name}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>{product.variants[0]?.color || "HIDI style"}</HidiText>
              <HidiText variant="secondary">{formatINRPaise(product.minPricePaise)}</HidiText>
            </View>
          </View>
        ) : null}

        <View style={[styles.icon, { backgroundColor: colors.blush }]}><Heart size={30} color={colors.action} /></View>
        <HidiText variant="title" style={styles.center}>This style is taking a little break.</HidiText>
        <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>
          {notFound ? "This product is no longer published in the current catalogue." : "This published style is currently sold out."}
        </HidiText>
        <HidiButton label="Explore similar styles" onPress={() => navigation.navigate("SimilarStyles", { slug: route.params.slug })} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => navigation.navigate("MainTabs", { screen: "Shop" })}>
          <HidiText variant="secondary" style={{ color: colors.action }}>Browse HIDI</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 24, gap: 16, alignItems: "center" },
  productRow: { alignSelf: "stretch", flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 92, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  icon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginTop: 20 },
  center: { textAlign: "center" },
  bold: { fontWeight: "600" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
