import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { ProductGrid } from "../../components/ProductGrid";
import { EmptyState, ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { getRelatedProducts } from "../../data/productDetail";
import { useProductDetail } from "../../data/useProductDetail";
import type { ApiProduct } from "../../models/product";
import { useHidiTheme } from "../../theme/HidiTheme";
import { HidiApiError } from "../../network/apiClient";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SimilarStyles">;

export default function SimilarStylesScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const source = useProductDetail(route.params.slug);
  const [items, setItems] = useState<ApiProduct[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try { setItems(await getRelatedProducts(route.params.slug, 6)); }
    catch (cause) {
      if (cause instanceof HidiApiError && cause.status === 404) setItems([]);
      else setError(cause instanceof Error ? cause.message : "Similar styles are unavailable.");
    }
  }

  useEffect(() => { void load(); }, [route.params.slug]);

  if (source.loading || items === null && !error) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (error) return <HidiScreen><ErrorState message={error} onRetry={() => void load()} /></HidiScreen>;

  return (
    <HidiScreen testID="H035" contentStyle={styles.zero}>
      <AppHeader title="Similar styles" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="title">A similar feeling.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>
          Alternatives come from the existing HIDI related-products service.
        </HidiText>
        {items?.length ? (
          <>
            {source.product ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>
              The service considers current catalogue relationships such as shared category or collection. It does not claim fabric or fit similarity unless those fields actually match.
            </HidiText> : null}
            <ProductGrid products={items} onOpen={(product) => navigation.push("ProductDeferred", { slug: product.slug })} />
          </>
        ) : (
          <EmptyState title="No similar styles right now." body="The related-products service did not return current alternatives." action="Browse categories" onAction={() => navigation.navigate("MainTabs", { screen: "Shop" })} />
        )}
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 12 },
});
