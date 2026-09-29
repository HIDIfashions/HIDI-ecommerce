import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { localStore } from "../../storage/localStore";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius } from "../../theme/tokens";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "StylePreferences">;

const options = [
  ["Everyday ease", "Effortless staples"],
  ["Soft tailoring", "Workwear, reimagined"],
  ["Occasion dressing", "A little something special"],
  ["Indian wear", "Thoughtful tradition edits"],
  ["Accessories", "The finishing touches"],
] as const;

export default function StylePreferencesScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => { void localStore.stylePreferences().then(setSelected); }, []);

  function toggle(value: string) {
    setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function finish(save: boolean) {
    if (save) await localStore.saveStylePreferences(selected);
    await localStore.setOnboardingSeen();
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  }

  return (
    <HidiScreen testID="H003" contentStyle={styles.zeroTop}>
      <AppHeader title="Style preferences" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>MAKE YOURSELF AT HOME</HidiText>
        <HidiText variant="title">Your style, your edit.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Choose what catches your eye. You can change this anytime.</HidiText>

        <View style={styles.list}>
          {options.map(([title, detail]) => {
            const active = selected.includes(title);
            return (
              <Pressable key={title} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => toggle(title)}
                style={[styles.option, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <HidiText variant="secondary" style={styles.optionTitle}>{title}</HidiText>
                  <HidiText variant="metadata" style={{ color: colors.mutedText }}>{detail}</HidiText>
                </View>
                <View style={[styles.box, { borderColor: active ? colors.action : colors.border, backgroundColor: active ? colors.action : "transparent" }]}>
                  {active ? <Check size={14} color={colors.canvas} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <HidiText variant="metadata" style={{ color: colors.mutedText }}>Your preferences never limit what you can shop.</HidiText>
        <View style={styles.actions}>
          <HidiButton label="Save my edit" onPress={() => void finish(true)} />
          <Pressable accessibilityRole="button" style={styles.skip} onPress={() => void finish(false)}>
            <HidiText variant="action">Skip for now</HidiText>
          </Pressable>
        </View>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 8 },
  list: { marginTop: 18 },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  optionTitle: { fontWeight: "600" },
  box: { width: 22, height: 22, borderWidth: 1, borderRadius: hidiRadius.control / 2, alignItems: "center", justifyContent: "center" },
  actions: { marginTop: 26, gap: 8 },
  skip: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
