import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CloudOff, RefreshCw, SearchX } from "lucide-react-native";
import { HidiButton } from "./HidiButton";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../theme/tokens";

export function CatalogSkeleton() {
  const { colors } = useHidiTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading HIDI styles" style={styles.skeletonRoot}>
      <View style={[styles.heroSkeleton, { backgroundColor: colors.blush }]} />
      <View style={styles.grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.skeletonCard}>
            <View style={[styles.imageSkeleton, { backgroundColor: colors.blush }]} />
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <View style={[styles.lineShort, { backgroundColor: colors.border }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useHidiTheme();
  const offline = /offline/i.test(message);
  return (
    <View style={styles.centered}>
      {offline ? <CloudOff size={32} color={colors.action} /> : <RefreshCw size={32} color={colors.action} />}
      <HidiText variant="title" style={styles.centerText}>{offline ? "You’re offline." : "Something went wrong."}</HidiText>
      <HidiText variant="secondary" style={[styles.centerText, { color: colors.mutedText }]}>{message}</HidiText>
      <HidiButton label="Try again" onPress={onRetry} style={{ alignSelf: "stretch" }} />
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  onAction,
  icon = "heart",
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  icon?: "heart" | "search";
}) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.centered}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.blush }]}>
        {icon === "search" ? <SearchX size={30} color={colors.action} /> : <HidiText variant="title" style={{ color: colors.action }}>♡</HidiText>}
      </View>
      <HidiText variant="title" style={styles.centerText}>{title}</HidiText>
      <HidiText variant="secondary" style={[styles.centerText, { color: colors.mutedText }]}>{body}</HidiText>
      <HidiButton label={action} onPress={onAction} style={{ alignSelf: "stretch" }} />
    </View>
  );
}

export function OfflineBadge() {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.blush }]}>
      <CloudOff size={14} color={colors.action} />
      <HidiText variant="metadata">Saved content · availability may have changed</HidiText>
    </View>
  );
}

export function InlineFailure({ label, onRetry }: { label: string; onRetry?: () => void }) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.inlineFailure, { borderColor: colors.border }]}>
      <HidiText variant="secondary" style={{ flex: 1 }}>{label}</HidiText>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <HidiText variant="action" style={{ color: colors.action }}>Retry</HidiText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonRoot: { gap: 20 },
  heroSkeleton: { height: 190, borderRadius: hidiRadius.card },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: hidiSpacing.gridGap },
  skeletonCard: { width: "48%", gap: 8 },
  imageSkeleton: { aspectRatio: 4 / 5, borderRadius: hidiRadius.card },
  line: { height: 12, borderRadius: 6, width: "90%" },
  lineShort: { height: 10, borderRadius: 5, width: "56%" },
  centered: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  centerText: { textAlign: "center" },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
  inlineFailure: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  retry: { minHeight: 48, justifyContent: "center" },
});
