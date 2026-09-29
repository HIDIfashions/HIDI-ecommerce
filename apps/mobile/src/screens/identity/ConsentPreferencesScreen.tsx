import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ToggleRow } from "../../components/ToggleRow";
import { hidiRequest } from "../../network/apiClient";
import { hidiEndpoints } from "../../network/endpoints";
import { localStore } from "../../storage/localStore";
import { useAuth } from "../../auth/AuthContext";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ConsentPreferences">;

type PreferencePayload = {
  enabled: boolean;
  consentVersion: string;
  whatsappOptIn: boolean;
  personalizationOptIn: boolean;
};

export default function ConsentPreferencesScreen({ navigation }: Props) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [personalization, setPersonalization] = useState(false);
  const [promotional, setPromotional] = useState(false);
  const [consentVersion, setConsentVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void localStore.consentDraft().then((draft) => {
      if (!alive) return;
      setPersonalization(draft.personalizationOptIn);
      setPromotional(draft.whatsappOptIn);
    });
    if (auth.session) {
      void hidiRequest<PreferencePayload>(hidiEndpoints.retentionPreferences, { accessToken: auth.session.access_token })
        .then((payload) => {
          if (!alive) return;
          setConsentVersion(payload.consentVersion);
          setPersonalization(payload.personalizationOptIn);
          setPromotional(payload.whatsappOptIn);
        })
        .catch(() => undefined);
    }
    return () => { alive = false; };
  }, [auth.session]);

  async function save() {
    setBusy(true); setError("");
    try {
      await localStore.saveConsentDraft({ personalizationOptIn: personalization, whatsappOptIn: promotional });
      if (auth.session && consentVersion) {
        await hidiRequest(hidiEndpoints.retentionPreferences, {
          method: "PATCH",
          accessToken: auth.session.access_token,
          body: JSON.stringify({ consentVersion, personalizationOptIn: personalization, whatsappOptIn: promotional }),
        });
      }
      navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your current choices are safe. Please try saving again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <HidiScreen testID="H007" contentStyle={styles.zeroTop}>
      <AppHeader title="Consent preferences" onBack={navigation.goBack} />
      <View style={styles.body}>
        <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>PRIVACY, WITH CHOICE</HidiText>
        <HidiText variant="title">You’re in control.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Choose how HIDI uses optional data. Shopping works either way.</HidiText>

        <View style={styles.list}>
          <ToggleRow title="Essential services" detail="Needed to save your bag, process orders and protect your account." value fixedLabel="Always on" onValueChange={() => undefined} disabled />
          <ToggleRow title="Product analytics" detail="Help us understand what works. Stored only when the approved analytics layer is active." value={personalization} onValueChange={setPersonalization} />
          <ToggleRow title="Personalised suggestions" detail="Use your saved interests and consented product activity." value={personalization} onValueChange={setPersonalization} />
          <ToggleRow title="Promotional messages" detail="Receive optional HIDI updates through an approved verified channel." value={promotional} onValueChange={setPromotional} />
        </View>

        <MessageCard>You can change or withdraw these choices later. Rejecting optional purposes does not block shopping.</MessageCard>
        {error ? <MessageCard tone="error">{error}</MessageCard> : null}
        <HidiButton label="Save preferences" loading={busy} onPress={() => void save()} />
      </View>
    </HidiScreen>
  );
}

const styles = StyleSheet.create({
  zeroTop: { paddingHorizontal: 0, paddingTop: 0 },
  body: { paddingHorizontal: 20, paddingTop: 28, gap: 14 },
  list: { marginTop: 6 },
});
