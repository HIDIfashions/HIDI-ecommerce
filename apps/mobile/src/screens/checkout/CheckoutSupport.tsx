import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { HidiText } from "../../components/HidiText";
import { useHidiTheme } from "../../theme/HidiTheme";
import { formatINRPaise } from "../../models/product";
import { cartLineImage, CartLine } from "../../models/cart";
import type { CheckoutAddress, CheckoutContact, DeliverySelection } from "../../models/checkout";
import { addressSummary } from "../../models/checkout";
import { hidiRadius } from "../../theme/tokens";

export function SectionCard({ children }: { children: React.ReactNode }) {
  const { colors } = useHidiTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

export function RowLink({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.rowLink, { borderBottomColor: colors.border }]}> 
      <View style={{ flex: 1 }}>
        <HidiText variant="secondary" style={styles.bold}>{title}</HidiText>
        {detail ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>{detail}</HidiText> : null}
      </View>
      <ChevronRight size={18} color={colors.mutedText} />
    </Pressable>
  );
}

export function ContactSummary({ contact }: { contact: CheckoutContact }) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.summaryBlock}>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>Contact</HidiText>
      <HidiText variant="secondary" style={styles.bold}>{contact.phone}</HidiText>
      {contact.email ? <HidiText variant="metadata">{contact.email}</HidiText> : null}
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>{contact.verified ? "Verified session" : "Guest contact saved for order updates"}</HidiText>
    </View>
  );
}

export function AddressSummary({ address }: { address: CheckoutAddress }) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.summaryBlock}>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>Delivery address</HidiText>
      <HidiText variant="secondary">{addressSummary(address)}</HidiText>
    </View>
  );
}

export function DeliverySummary({ delivery }: { delivery: DeliverySelection }) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.summaryBlock}>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>Delivery method</HidiText>
      <HidiText variant="secondary" style={styles.bold}>{delivery.label}</HidiText>
      <HidiText variant="metadata">PIN {delivery.pin}{delivery.city ? " · " + delivery.city : ""}</HidiText>
      <HidiText variant="metadata" style={{ color: colors.mutedText }}>Delivery fees are not returned by the current API.</HidiText>
    </View>
  );
}

export function CheckoutLine({ line }: { line: CartLine }) {
  const { colors } = useHidiTheme();
  const image = cartLineImage(line);
  return (
    <View style={[styles.line, { borderBottomColor: colors.border }]}> 
      <View style={[styles.thumb, { backgroundColor: colors.blush }]}>{image ? <Image source={{ uri: image }} style={styles.image} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <HidiText variant="secondary" style={styles.bold}>{line.product.name}</HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText }}>{line.variant.color} · Size {line.variant.size} · Qty {line.quantity}</HidiText>
        <HidiText variant="secondary">{formatINRPaise(line.lineTotalPaise)}</HidiText>
      </View>
    </View>
  );
}

export function MoneyRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const { colors } = useHidiTheme();
  return (
    <View style={styles.moneyRow}>
      <HidiText variant={muted ? "metadata" : "secondary"} style={{ color: muted ? colors.mutedText : colors.ink }}>{label}</HidiText>
      <HidiText variant={muted ? "metadata" : "secondary"} style={[styles.bold, { color: muted ? colors.mutedText : colors.ink }]}>{value}</HidiText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: hidiRadius.card, padding: 14, gap: 10 },
  rowLink: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bold: { fontWeight: "600" },
  summaryBlock: { gap: 3 },
  line: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 64, height: 82, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
});