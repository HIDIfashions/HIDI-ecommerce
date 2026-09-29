import React, { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { useCatalog } from "../../data/CatalogContext";
import { formatINRPaise, productImage } from "../../models/product";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ProductDeferred">;

export default function DeferredProductScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { state, refresh } = useCatalog();
  const product = useMemo(() => state.kind === "content" ? state.data.find((item) => item.slug === route.params.slug) : undefined, [state, route.params.slug]);

  React.useEffect(() => {
    void localStore.rememberViewed(route.params.slug);
    void localStore.saveLastSafeRoute("product:" + route.params.slug);
  }, [route.params.slug]);

  return (
    <HidiScreen>
      <AppHeader title="HIDI" onBack={navigation.goBack} />
      {state.kind === "loading" ? <CatalogSkeleton /> : null}
      {state.kind === "error" ? <ErrorState message={state.errorKind} onRetry={() => void refresh()} /> : null}
      {state.kind === "content" && product ? (
        <View style={styles.body}>
          <View style={[styles.media, { backgroundColor: colors.blush }]}>
            {productImage(product) ? <Image source={{ uri: productImage(product) }} style={styles.image} resizeMode="cover" /> : null}
          </View>
          <HidiText variant="title">{product.name}</HidiText>
          <HidiText variant="secondary">{formatINRPaise(product.minPricePaise)}</HidiText>
          <HidiText variant="secondary" style={{ color: colors.mutedText }}>
            Product detail, sizing and add-to-bag are implemented in Phase 2. This Phase 1 route preserves your discovery position and recently viewed history.
          </HidiText>
        </View>
      ) : state.kind === "content" ? (
        <HidiText variant="secondary">This style is no longer available in the current catalogue.</HidiText>
      ) : null}
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  media: { aspectRatio: 3 / 4, borderRadius: hidiRadius.card, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
});
