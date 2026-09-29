import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AlertTriangle } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AddressErrors">;

export default function AddressErrorsScreen({ navigation, route }: Props) {
  const { colors } = useHidiTheme();
  const entries = Object.entries(route.params.errors);
  return (
    <HidiScreen testID="H048" contentStyle={styles.zero}>
      <AppHeader title="Address validation errors" onBack={navigation.goBack} />
      <View style={styles.body}>
        <AlertTriangle size={30} color={colors.error} />
        <HidiText variant="title">Some address details need another look.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Your valid entries are preserved. Correct the fields below and save again.</HidiText>
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          {entries.map(([field, message]) => (
            <View key={field} style={[styles.errorRow, { borderBottomColor: colors.border }]}> 
              <HidiText variant="metadata" style={{ color: colors.error }}>{field}</HidiText>
              <HidiText variant="secondary">{message}</HidiText>
            </View>
          ))}
        </View>
        <MessageCard>Examples: include your house or flat number, a complete six-digit PIN and a reachable mobile number.</MessageCard>
        <HidiButton label="Save corrected address" onPress={() => navigation.replace("AddAddress")} />
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={navigation.goBack}>
          <HidiText variant="metadata" style={{ color: colors.action }}>Back to address form</HidiText>
        </Pressable>
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 22, gap: 15 },
  list: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  errorRow: { padding: 12, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
