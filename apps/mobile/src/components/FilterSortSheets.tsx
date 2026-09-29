import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { ApiProduct } from "../models/product";
import { emptyFilters, facets, filterProducts, Filters, SortKey } from "../data/catalog";
import { AppHeader } from "./AppHeader";
import { HidiButton } from "./HidiButton";
import { HidiField } from "./HidiField";
import { HidiText } from "./HidiText";
import { useHidiTheme } from "../theme/HidiTheme";
import { hidiRadius } from "../theme/tokens";

type FilterGroup = "size" | "colour" | "fabric" | "price";

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useHidiTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, { borderBottomColor: colors.border }]}
    >
      <HidiText variant="secondary" style={{ flex: 1 }}>{label}</HidiText>
      <View style={[styles.check, { borderColor: selected ? colors.action : colors.border, backgroundColor: selected ? colors.action : "transparent" }]}>
        {selected ? <Check size={14} color={colors.canvas} /> : null}
      </View>
    </Pressable>
  );
}

function GroupBody({
  group,
  options,
  draft,
  setDraft,
}: {
  group: FilterGroup;
  options: ReturnType<typeof facets>;
  draft: Filters;
  setDraft: React.Dispatch<React.SetStateAction<Filters>>;
}) {
  const { colors } = useHidiTheme();

  function toggle(field: "sizes" | "colors" | "fabrics", value: string) {
    setDraft((before) => ({
      ...before,
      [field]: before[field].includes(value)
        ? before[field].filter((item) => item !== value)
        : [...before[field], value],
    }));
  }

  if (group === "size") {
    return (
      <View>
        <HidiText variant="secondary" style={styles.groupTitle}>Size</HidiText>
        <HidiText variant="metadata" style={{ color: colors.mutedText, marginBottom: 8 }}>
          Sizes reflect currently available SKUs.
        </HidiText>
        {options.sizes.map((value) => (
          <Choice key={value} label={value} selected={draft.sizes.includes(value)} onPress={() => toggle("sizes", value)} />
        ))}
      </View>
    );
  }

  if (group === "colour") {
    return (
      <View>
        <HidiText variant="secondary" style={styles.groupTitle}>Colour</HidiText>
        {options.colors.map((value) => (
          <Choice key={value} label={value} selected={draft.colors.includes(value)} onPress={() => toggle("colors", value)} />
        ))}
      </View>
    );
  }

  if (group === "fabric") {
    return (
      <View>
        <HidiText variant="secondary" style={styles.groupTitle}>Fabric</HidiText>
        {options.fabrics.length ? options.fabrics.map((value) => (
          <Choice key={value} label={value} selected={draft.fabrics.includes(value)} onPress={() => toggle("fabrics", value)} />
        )) : (
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>No fabric facets are published for this edit.</HidiText>
        )}
      </View>
    );
  }

  return (
    <View>
      <HidiText variant="secondary" style={styles.groupTitle}>Price</HidiText>
      <HidiText variant="metadata" style={{ color: colors.mutedText, marginBottom: 12 }}>
        Enter an amount instead of relying on a precision slider.
      </HidiText>
      <HidiField
        label="Minimum ₹"
        keyboardType="number-pad"
        value={draft.minPricePaise === undefined ? "" : String(Math.round(draft.minPricePaise / 100))}
        onChangeText={(value) => setDraft((before) => ({
          ...before,
          minPricePaise: value ? Number(value.replace(/\D/g, "")) * 100 : undefined,
        }))}
      />
      <View style={{ height: 14 }} />
      <HidiField
        label="Maximum ₹"
        keyboardType="number-pad"
        value={draft.maxPricePaise === undefined ? "" : String(Math.round(draft.maxPricePaise / 100))}
        onChangeText={(value) => setDraft((before) => ({
          ...before,
          maxPricePaise: value ? Number(value.replace(/\D/g, "")) * 100 : undefined,
        }))}
      />
    </View>
  );
}

export function FilterSheet({
  visible,
  products,
  current,
  onClose,
  onApply,
}: {
  visible: boolean;
  products: ApiProduct[];
  current: Filters;
  onClose: () => void;
  onApply: (filters: Filters) => void;
}) {
  const { colors } = useHidiTheme();
  const { width, fontScale } = useWindowDimensions();
  const [draft, setDraft] = useState<Filters>(current);
  const [activeGroup, setActiveGroup] = useState<FilterGroup>("size");
  const options = useMemo(() => facets(products), [products]);
  const stackGroups = width < 360 || fontScale >= 1.6;

  useEffect(() => {
    if (!visible) return;
    setDraft(current);
    setActiveGroup("size");
  }, [visible, current]);

  const liveCount = filterProducts(products, draft).length;
  const selected = {
    size: draft.sizes.length,
    colour: draft.colors.length,
    fabric: draft.fabrics.length,
    price: draft.minPricePaise !== undefined || draft.maxPricePaise !== undefined ? 1 : 0,
  };
  const selectedCount = selected.size + selected.colour + selected.fabric + selected.price;
  const groups: Array<{ key: FilterGroup; label: string }> = [
    { key: "size", label: "Size" },
    { key: "colour", label: "Colour" },
    { key: "price", label: "Price" },
    { key: "fabric", label: "Fabric" },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View testID="H017" style={[styles.full, { backgroundColor: colors.canvas }]}>
        <AppHeader title="Filter products" onBack={onClose} />

        <View style={styles.filterIntro}>
          <HidiText variant="title">Make it your edit.</HidiText>
          <HidiText variant="metadata" style={{ color: colors.mutedText }}>
            {selectedCount} selected · {liveCount} matching {liveCount === 1 ? "style" : "styles"}
          </HidiText>
          {liveCount === 0 ? (
            <HidiText variant="metadata" style={{ color: colors.caution }}>
              No current style has this exact combination. Adjust one option to recover results.
            </HidiText>
          ) : null}
        </View>

        {stackGroups ? (
          <ScrollView contentContainerStyle={styles.stackedGroups}>
            {groups.map((group) => (
              <View key={group.key} style={[styles.stackedSection, { borderTopColor: colors.border }]}>
                <GroupBody group={group.key} options={options} draft={draft} setDraft={setDraft} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.filterWorkspace}>
            <View style={[styles.rail, { borderRightColor: colors.border }]}>
              {groups.map((group) => (
                <Pressable
                  key={group.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeGroup === group.key }}
                  onPress={() => setActiveGroup(group.key)}
                  style={[
                    styles.railItem,
                    activeGroup === group.key && { backgroundColor: colors.blush },
                  ]}
                >
                  <HidiText variant="metadata" style={activeGroup === group.key ? styles.railActive : undefined}>
                    {group.label}{selected[group.key] ? " · " + selected[group.key] : ""}
                  </HidiText>
                </Pressable>
              ))}
            </View>
            <ScrollView style={styles.values} contentContainerStyle={styles.valuesContent}>
              <GroupBody group={activeGroup} options={options} draft={draft} setDraft={setDraft} />
            </ScrollView>
          </View>
        )}

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.canvas }]}>
          <HidiButton
            label={"Show " + liveCount + (liveCount === 1 ? " style" : " styles")}
            onPress={() => onApply(draft)}
          />
          <Pressable accessibilityRole="button" style={styles.clear} onPress={() => setDraft(emptyFilters)}>
            <HidiText variant="action">Clear all</HidiText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const sortOptions: Array<{ key: SortKey; label: string; disabled?: boolean; note?: string }> = [
  { key: "recommended", label: "Recommended" },
  { key: "newest", label: "Newest", disabled: true, note: "Needs a stable published-date sort from the catalogue API." },
  { key: "price-low", label: "Price: low to high" },
  { key: "price-high", label: "Price: high to low" },
  { key: "rating", label: "Highest rated" },
];

export function SortSheet({
  visible,
  current,
  onClose,
  onApply,
}: {
  visible: boolean;
  current: SortKey;
  onClose: () => void;
  onApply: (sort: SortKey) => void;
}) {
  const { colors } = useHidiTheme();
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (visible) setDraft(current);
  }, [visible, current]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View testID="H018" style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close sort" />
        <View style={[styles.sortSheet, { backgroundColor: colors.canvas }]}>
          <View style={styles.handle} />
          <View style={styles.sortHeader}>
            <View style={{ flex: 1 }}>
              <HidiText variant="title">Sort your styles.</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>A different way to find your favourites.</HidiText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>
          {sortOptions.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: draft === option.key, disabled: option.disabled }}
              disabled={option.disabled}
              onPress={() => setDraft(option.key)}
              style={[styles.sortRow, { borderBottomColor: colors.border, opacity: option.disabled ? 0.5 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <HidiText variant="secondary">{option.label}</HidiText>
                {option.note ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>{option.note}</HidiText> : null}
              </View>
              <View style={[styles.radio, { borderColor: draft === option.key ? colors.action : colors.border }]}>
                {draft === option.key ? <View style={[styles.radioDot, { backgroundColor: colors.action }]} /> : null}
              </View>
            </Pressable>
          ))}
          <HidiButton label="Apply sort" onPress={() => onApply(draft)} style={{ marginTop: 18 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  filterIntro: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 5 },
  filterWorkspace: { flex: 1, flexDirection: "row", paddingBottom: 112 },
  rail: { width: 112, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  railItem: { minHeight: 52, justifyContent: "center", paddingHorizontal: 14 },
  railActive: { fontWeight: "700" },
  values: { flex: 1 },
  valuesContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },
  groupTitle: { fontWeight: "600", marginBottom: 4 },
  stackedGroups: { paddingHorizontal: 20, paddingBottom: 124 },
  stackedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 20 },
  choice: { minHeight: 52, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  clear: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(20,16,18,0.36)" },
  sortSheet: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: hidiRadius.sheet, borderTopRightRadius: hidiRadius.sheet },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#B7ADB1", alignSelf: "center", marginBottom: 16 },
  sortHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 12 },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  sortRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  radio: { width: 20, height: 20, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
