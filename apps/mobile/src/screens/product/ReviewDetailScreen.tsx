import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BadgeCheck, ImageOff } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ErrorState, CatalogSkeleton } from "../../components/StateViews";
import { ApiProductReview, getProductReviews } from "../../data/productDetail";
import { useProductDetail } from "../../data/useProductDetail";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ReviewDetail">;

export default function ReviewDetailScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const detail = useProductDetail(route.params.slug);
  const [review, setReview] = useState<ApiProductReview | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  async function load() {
    if (!detail.product) return;
    setError("");
    setMissing(false);
    try {
      const data = await getProductReviews(detail.product.id);
      const found = data.reviews.find((item) => item.id === route.params.reviewId);
      if (!found) {
        setReview(null);
        setMissing(true);
      } else setReview(found);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This review is unavailable.");
    }
  }

  useEffect(() => { if (detail.product) void load(); }, [detail.product?.id, route.params.reviewId]);

  if (detail.loading || (!review && !error && !missing)) return <HidiScreen><CatalogSkeleton /></HidiScreen>;
  if (missing && detail.product) {
    return (
      <HidiScreen testID="H032" contentStyle={styles.zero}>
        <AppHeader title="Review detail & photos" onBack={navigation.goBack} />
        <View style={styles.body}>
          <MessageCard>This review is no longer available. Other published reviews for this style are still available.</MessageCard>
          <HidiButton label="Back to reviews" onPress={() => navigation.replace("Reviews", { slug: detail.product!.slug })} />
        </View>
      </HidiScreen>
    );
  }
  if (detail.error || error || !review) return <HidiScreen><ErrorState message={detail.error || error || "Review unavailable."} onRetry={() => void load()} /></HidiScreen>;

  return (
    <HidiScreen testID="H032" contentStyle={styles.zero}>
      <AppHeader title="Review detail & photos" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="secondary">{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</HidiText>
        <HidiText variant="title">{review.title || "Customer review"}</HidiText>
        <View style={styles.meta}>
          <HidiText variant="metadata">{review.reviewerName}</HidiText>
          {review.verifiedPurchase ? <View style={styles.verified}><BadgeCheck size={14} color={colors.success} /><HidiText variant="metadata">Verified purchase</HidiText></View> : null}
        </View>
        <HidiText variant="body">{review.body}</HidiText>

        <View style={[styles.photoEmpty, { backgroundColor: colors.blush }]}>
          <ImageOff size={28} color={colors.mutedText} />
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>The current public review API does not supply review photos.</HidiText>
        </View>

        <MessageCard>
          Purchased variant, incentive disclosure, helpful voting and report actions are not exposed by the current public review contract. This screen does not invent them or expose private order identifiers.
        </MessageCard>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 14 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  verified: { flexDirection: "row", gap: 4, alignItems: "center" },
  photoEmpty: { minHeight: 150, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
});
