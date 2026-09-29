import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { HidiText } from "../../components/HidiText";
import { CatalogSkeleton, ErrorState } from "../../components/StateViews";
import { resolveHidiMediaUrl } from "../../network/config";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ProductGallery">;

function PinchImage({ uri, alt, width, active }: { uri: string; alt: string; width: number; active: boolean }) {
  const { colors } = useHidiTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const startScale = useRef(1);
  const startDistance = useRef(1);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (active) return;
    currentScale.current = 1;
    scale.setValue(1);
  }, [active, scale]);

  function distance(touches: readonly { pageX: number; pageY: number }[]) {
    if (touches.length < 2) return 1;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
    onPanResponderGrant: (event) => {
      startDistance.current = distance(event.nativeEvent.touches);
      startScale.current = currentScale.current;
    },
    onPanResponderMove: (event) => {
      if (event.nativeEvent.touches.length < 2) return;
      const ratio = distance(event.nativeEvent.touches) / Math.max(1, startDistance.current);
      const next = Math.min(3, Math.max(1, startScale.current * ratio));
      scale.setValue(next);
      currentScale.current = next;
    },
    onPanResponderRelease: () => {
      if (currentScale.current < 1.03) {
        currentScale.current = 1;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
      }
    },
  })).current;

  return (
    <View style={[styles.frame, { width, backgroundColor: colors.blush }]} {...responder.panHandlers}>
      {!broken && uri ? (
        <Animated.View style={{ width, height: "100%", transform: [{ scale }] }}>
          <Image source={{ uri }} resizeMode="contain" style={{ width, height: "100%" }} onError={() => setBroken(true)} accessibilityLabel={alt} />
        </Animated.View>
      ) : (
        <View style={styles.fallback}>
          <ImageIcon size={36} color={colors.mutedText} />
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>This gallery frame is unavailable. Use previous or next to skip it.</HidiText>
        </View>
      )}
    </View>
  );
}

export default function ProductGalleryScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const { width } = useWindowDimensions();
  const { product, loading, error, reload } = useProductDetail(route.params.slug);
  const [index, setIndex] = useState(Math.max(0, route.params.initialIndex ?? 0));
  const scrollRef = useRef<ScrollView>(null);

  const media = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    return [...product.variants.flatMap((variant) => variant.images ?? []), ...product.images].filter((item) => {
      const resolved = resolveHidiMediaUrl(item.url);
      if (!resolved || seen.has(resolved)) return false;
      seen.add(resolved);
      return true;
    });
  }, [product]);

  if (loading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><CatalogSkeleton /></SafeAreaView>;
  if (error) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]}><ErrorState message={error} onRetry={() => void reload()} /></SafeAreaView>;

  const safeIndex = media.length ? Math.min(index, media.length - 1) : 0;

  function move(next: number) {
    if (!media.length) return;
    const target = Math.min(media.length - 1, Math.max(0, next));
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
  }

  return (
    <SafeAreaView testID="H024" style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <AppHeader title="Full-screen gallery" onBack={navigation.goBack} />
      {media.length ? (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))}
          >
            {media.map((item, mediaIndex) => (
              <PinchImage
                key={item.id + ":" + item.url}
                uri={resolveHidiMediaUrl(item.url)}
                alt={item.alt || product?.name || "HIDI garment"}
                width={width}
                active={mediaIndex === safeIndex}
              />
            ))}
          </ScrollView>
          <View style={[styles.controls, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous image" disabled={safeIndex <= 0} onPress={() => move(safeIndex - 1)} style={[styles.nav, { opacity: safeIndex <= 0 ? 0.35 : 1 }]}>
              <ChevronLeft size={20} color={colors.ink} />
            </Pressable>
            <View style={styles.count}>
              <HidiText variant="metadata">{safeIndex + 1} of {media.length}</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>Swipe or pinch to inspect garment details.</HidiText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next image" disabled={safeIndex >= media.length - 1} onPress={() => move(safeIndex + 1)} style={[styles.nav, { opacity: safeIndex >= media.length - 1 ? 0.35 : 1 }]}>
              <ChevronRight size={20} color={colors.ink} />
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.fallback}><ImageIcon size={36} color={colors.mutedText} /><HidiText variant="secondary">No product media is currently supplied.</HidiText></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  frame: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  controls: { minHeight: 84, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  nav: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  count: { flex: 1, alignItems: "center", gap: 2 },
});
