import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BadgeCheck, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../components/AppHeader";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton, EmptyState, ErrorState } from "../../components/StateViews";
import { ApiProductReviews, getProductReviews } from "../../data/productDetail";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Reviews">;
type ReviewSort = "newest" | "highest";

export default function ReviewsScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const detail = useProductDetail(route.params.slug);
  const [data, setData] = useState<ApiProductReviews | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  async function loadReviews(productId: string) {
    setError("");
    try { setData(await getProductReviews(productId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reviews are unavailable."); }
  }

  useEffect(() => {
    if (detail.product) void loadReviews(detail.product.id);
  }, [detail.product?.id]);

  const reviews = useMemo(() => {
    const source = (data?.reviews ?? []).filter((review) => !verifiedOnly || review.verifiedPurchase);
    if (sort === "highest") return [...source].sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
    return [...source].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data, sort, verifiedOnly]);

  if (detail.loading || (!data && !error)) return <SafeAreaView style={[styles.fill, { backgroundColor: colors.canvas }]}><CatalogSkeleton /></SafeAreaView>;
  if (detail.error || error || !detail.product || !data) return <SafeAreaView style={[styles.fill, { backgroundColor: colors.canvas }]}><ErrorState message={detail.error || error || "Reviews are unavailable."} onRetry={() => detail.product ? void loadReviews(detail.product.id) : void detail.reload()} /></SafeAreaView>;

  if (data.reviewCount === 0) {
    return (
      <SafeAreaView testID="H031" style={[styles.fill, { backgroundColor: colors.canvas }]}>
        <AppHeader title="Ratings & reviews" onBack={navigation.goBack} />
        <EmptyState title="No reviews yet." body="Published feedback from eligible delivered orders will appear here." action="Back to product" onAction={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="H031" style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <AppHeader title="Ratings & reviews" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <HidiText variant="title">What you’re saying.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>{detail.product.name}</HidiText>

        <View style={styles.summary}>
          <View style={styles.score}>
            <HidiText variant="display" style={{ color: colors.action }}>{data.averageRating.toFixed(1)}</HidiText>
            <HidiText variant="metadata">{data.reviewCount} published {data.reviewCount === 1 ? "review" : "reviews"}</HidiText>
            <HidiText variant="metadata">{data.verifiedReviewCount} verified purchase</HidiText>
          </View>
          <View style={styles.distribution}>
            {[5,4,3,2,1].map((rating) => {
              const count = data.ratingDistribution[rating as 1|2|3|4|5] ?? 0;
              const pct = data.reviewCount ? count / data.reviewCount : 0;
              return (
                <View key={rating} style={styles.distRow}>
                  <HidiText variant="metadata" style={styles.starLabel}>{rating} ★</HidiText>
                  <View style={[styles.track, { backgroundColor: colors.border }]}>
                    <View style={[styles.fillBar, { backgroundColor: colors.action, width: Math.max(0, Math.min(1, pct)) * 100 + "%" }]} />
                  </View>
                  <HidiText variant="metadata" style={styles.count}>{count}</HidiText>
                </View>
              );
            })}
          </View>
        </View>

        <MessageCard>Ratings are calculated from all published reviews returned by the HIDI review API. A size-fit aggregate is not supplied by the current API and is therefore not shown.</MessageCard>

        <View style={styles.chips}>
          <Pressable onPress={() => setSort("newest")} style={[styles.chip, { borderColor: sort === "newest" ? colors.action : colors.border, backgroundColor: sort === "newest" ? colors.blush : colors.surface }]}><HidiText variant="metadata">Most recent</HidiText></Pressable>
          <Pressable onPress={() => setSort("highest")} style={[styles.chip, { borderColor: sort === "highest" ? colors.action : colors.border, backgroundColor: sort === "highest" ? colors.blush : colors.surface }]}><HidiText variant="metadata">Highest rated</HidiText></Pressable>
          <Pressable onPress={() => setVerifiedOnly((value) => !value)} style={[styles.chip, { borderColor: verifiedOnly ? colors.action : colors.border, backgroundColor: verifiedOnly ? colors.blush : colors.surface }]}><HidiText variant="metadata">Verified only</HidiText></Pressable>
        </View>

        {reviews.map((review) => (
          <Pressable key={review.id} accessibilityRole="button" onPress={() => navigation.navigate("ReviewDetail", { slug: detail.product!.slug, reviewId: review.id })} style={[styles.review, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.reviewTop}>
              <HidiText variant="secondary">{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</HidiText>
              {review.verifiedPurchase ? <View style={styles.verified}><BadgeCheck size={14} color={colors.success} /><HidiText variant="metadata">Verified purchase</HidiText></View> : null}
            </View>
            {review.title ? <HidiText variant="secondary" style={styles.bold}>{review.title}</HidiText> : null}
            <HidiText variant="secondary" numberOfLines={3}>{review.body}</HidiText>
            <View style={styles.reviewFooter}>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>{review.reviewerName}</HidiText>
              <ChevronRight size={16} color={colors.mutedText} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  summary: { flexDirection: "row", gap: 18, alignItems: "center" },
  score: { width: 118, gap: 3 },
  distribution: { flex: 1, gap: 5 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  starLabel: { width: 26 },
  count: { width: 22, textAlign: "right" },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  fillBar: { height: 5, borderRadius: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderRadius: 20 },
  review: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  reviewTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  verified: { flexDirection: "row", gap: 4, alignItems: "center" },
  reviewFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bold: { fontWeight: "600" },
});
