import React, { useMemo, useState } from "react";
import { AccessibilityInfo, Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiRadius, hidiSpacing } from "../../theme/tokens";
import { formatINRPaise } from "../../models/product";
import {
  appearanceChoices,
  attachmentUploadIssue,
  canRequestPermission,
  linkUnavailableReason,
  offlinePolicy,
  partialLoadRecovery,
  permissionDeclinedCopy,
  retryAfterMs,
  shouldShowOptionalUpdate,
  summarizeLookSelection,
  updateGate,
} from "../../models/system";
import type { AppearancePreference, PermissionFeature } from "../../models/system";
import { systemStorage } from "../../storage/systemStorage";
import type { RootStackParamList } from "../../navigation/types";

type Props<Name extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, Name>;

type BasicNavigation = { goBack: () => void; navigate: (name: string, params?: unknown) => void; replace: (name: string, params?: unknown) => void };

function safeBack(navigation: Pick<BasicNavigation, "goBack" | "navigate">) {
  try { navigation.goBack(); } catch { navigation.navigate("MainTabs", { screen: "Home" }); }
}

function Shell({ title, testID, navigation, children }: { title: string; testID: string; navigation: Pick<BasicNavigation, "goBack">; children: React.ReactNode }) {
  return (
    <HidiScreen testID={testID} contentStyle={styles.body}>
      <AppHeader title={title} onBack={navigation.goBack} />
      {children}
    </HidiScreen>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useHidiTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <HidiText variant="secondary" style={styles.bold}>{title}</HidiText>
      {children}
    </View>
  );
}

function QuietLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}><HidiText variant="secondary" style={{ color: colors.action }}>{label}</HidiText></Pressable>;
}

export function LoadingSkeletonScreen({ navigation }: Props<"LoadingSkeleton">) {
  const { colors } = useHidiTheme();
  return (
    <Shell testID="H103" title="Loading" navigation={navigation}>
      <HidiText variant="title">Preparing your HIDI view.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Skeletons match the final layout and are hidden from accessibility traversal.</HidiText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeletonStack}>
        {[0, 1, 2].map((item) => <View key={item} style={[styles.skeleton, { backgroundColor: colors.blush }]} />)}
      </View>
      <MessageCard>Slow connection? You can safely go back; HIDI will not trap this screen.</MessageCard>
    </Shell>
  );
}

export function PartialLoadFailureScreen({ navigation, route }: Props<"PartialLoadFailure">) {
  const recovery = partialLoadRecovery(["Editorial edit", "New arrivals"], route.params?.section ?? "Recommended styles", "section-retry-demo");
  return (
    <Shell testID="H104" title="Section could not load" navigation={navigation}>
      <HidiText variant="title">Most of the page is ready.</HidiText>
      <MessageCard>{recovery.failedSection} could not refresh. Existing content stays visible and only this section will retry.</MessageCard>
      <Panel title="Loaded content stays in place">
        {recovery.loadedItems.map((item) => <HidiText key={item} variant="metadata">{item}</HidiText>)}
      </Panel>
      <HidiButton label="Retry this section" onPress={() => undefined} />
    </Shell>
  );
}

export function OfflineSavedContentScreen({ navigation }: Props<"OfflineSavedContent">) {
  const policy = offlinePolicy({ hasSavedContent: true });
  return (
    <Shell testID="H105" title="Offline" navigation={navigation}>
      <HidiText variant="title">You are offline. Saved content is available.</HidiText>
      <MessageCard>{policy.cachedAvailabilityCopy}</MessageCard>
      <Panel title="Offline label">
        <HidiText variant="secondary">Checkout is disabled while offline. Wishlist changes can be queued with a sync status.</HidiText>
      </Panel>
      <HidiButton label="Retry connection" onPress={() => undefined} />
    </Shell>
  );
}

export function OfflineEmptyScreen({ navigation }: Props<"OfflineEmpty">) {
  return (
    <Shell testID="H106" title="No connection" navigation={navigation}>
      <HidiText variant="title">HIDI needs a connection to load this.</HidiText>
      <MessageCard>Try again when you are online. We will not keep rapidly retrying or ask you to open Settings.</MessageCard>
      <HidiButton label="Try again" onPress={() => undefined} />
    </Shell>
  );
}

export function GenericErrorScreen({ navigation, route }: Props<"GenericError">) {
  const requestId = route.params?.requestId ?? "req-local-demo";
  return (
    <Shell testID="H107" title="Something went wrong" navigation={navigation}>
      <HidiText variant="title">Something did not load correctly.</HidiText>
      <MessageCard>Try again. If you contact support, share reference {requestId}. Technical details and private data are not shown here.</MessageCard>
      <HidiButton label="Try again" onPress={() => undefined} />
    </Shell>
  );
}

export function SessionExpiredScreen({ navigation }: Props<"SessionExpired">) {
  return (
    <Shell testID="H108" title="Verify again" navigation={navigation}>
      <HidiText variant="title">Your secure session expired.</HidiText>
      <MessageCard>Public browsing is still available. HIDI will resume only the permitted action after sign-in and will not replay payments.</MessageCard>
      <HidiButton label="Verify again" onPress={() => navigation.navigate("SignIn", { returnTo: "resume-protected-action" })} />
    </Shell>
  );
}

export function MaintenanceScreen({ navigation, route }: Props<"Maintenance">) {
  return (
    <Shell testID="H109" title="Maintenance" navigation={navigation}>
      <HidiText variant="title">Some HIDI services are temporarily unavailable.</HidiText>
      <MessageCard>{route.params?.estimate ? "Expected recovery: " + route.params.estimate : "We will show a recovery time only when it is approved."} Existing-order support remains available through the public contact route.</MessageCard>
      <HidiButton label="Check again" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} />
      <QuietLink label="Contact HIDI" onPress={() => navigation.navigate("ContactHidi")} />
    </Shell>
  );
}

export function RequiredUpdateScreen({ navigation, route }: Props<"RequiredUpdate">) {
  const gate = updateGate({ installedVersion: route.params?.installedVersion ?? "1.0.0", minimumVersion: route.params?.minimumVersion ?? "1.0.1", trustedConfig: true });
  return (
    <Shell testID="H110" title="Update required" navigation={navigation}>
      <HidiText variant="title">Update HIDI to continue securely.</HidiText>
      <MessageCard>Installed version {route.params?.installedVersion ?? "1.0.0"}. Minimum supported version {route.params?.minimumVersion ?? "1.0.1"}. Reason: {gate.reason}.</MessageCard>
      <HidiButton label="Update HIDI" onPress={() => void Linking.openURL(route.params?.url ?? "https://thehidi.com/app")} />
    </Shell>
  );
}

export function UpdateAvailableScreen({ navigation, route }: Props<"UpdateAvailable">) {
  const visible = shouldShowOptionalUpdate({ dismissedAt: null });
  async function dismiss() { await systemStorage.dismissOptionalUpdate(); safeBack(navigation); }
  return (
    <Shell testID="H111" title="Update available" navigation={navigation}>
      <HidiText variant="title">A HIDI update is available.</HidiText>
      <MessageCard>{visible ? (route.params?.releaseNotes ?? "This update improves reliability and shopping states.") : "You dismissed this update recently."}</MessageCard>
      <HidiButton label="Update now" onPress={() => void Linking.openURL(route.params?.url ?? "https://thehidi.com/app")} />
      <QuietLink label="Not now" onPress={() => void dismiss()} />
    </Shell>
  );
}

export function PermissionExplanationScreen({ navigation, route }: Props<"PermissionExplanation">) {
  const feature = route.params?.feature ?? "notifications";
  const allowed = canRequestPermission({ userTriggered: true, firstLaunch: false, feature });
  return (
    <Shell testID="H112" title="Permission explanation" navigation={navigation}>
      <HidiText variant="title">Allow {feature === "photos" ? "photo access" : "notifications"} only when useful.</HidiText>
      <MessageCard>HIDI asks after a relevant action and keeps a manual alternative. First launch never prompts automatically.</MessageCard>
      <HidiButton label="Continue" disabled={!allowed} onPress={() => navigation.navigate("AndroidPermissionDialog", { returnTo: route.params?.returnTo })} />
      <QuietLink label="Not now" onPress={() => safeBack(navigation)} />
    </Shell>
  );
}

export function PermissionDeclinedScreen({ navigation, route }: Props<"PermissionDeclined">) {
  const feature = (route.params?.feature ?? "notifications") as PermissionFeature;
  return (
    <Shell testID="H113" title="Permission declined" navigation={navigation}>
      <HidiText variant="title">You can continue without it.</HidiText>
      <MessageCard>{permissionDeclinedCopy(feature)}</MessageCard>
      <HidiButton label="Continue without it" onPress={() => safeBack(navigation)} />
    </Shell>
  );
}

export function LinkUnavailableScreen({ navigation, route }: Props<"LinkUnavailable">) {
  return (
    <Shell testID="H114" title="Link unavailable" navigation={navigation}>
      <HidiText variant="title">This link cannot be opened.</HidiText>
      <MessageCard>{route.params?.reason ?? linkUnavailableReason({ hostAllowed: true, pathKnown: false, authorized: true })}</MessageCard>
      <HidiButton label="Explore HIDI" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} />
    </Shell>
  );
}

export function TooManyRequestsScreen({ navigation, route }: Props<"TooManyRequests">) {
  const retryMs = retryAfterMs(route.params?.retryAfterSeconds ?? 60) ?? 60000;
  return (
    <Shell testID="H115" title="Try again soon" navigation={navigation}>
      <HidiText variant="title">Temporary limit reached.</HidiText>
      <MessageCard>Try again after {Math.ceil(retryMs / 1000)} seconds. Browsing and support remain available.</MessageCard>
      <HidiButton label="Try after cooldown" onPress={() => undefined} />
    </Shell>
  );
}

export function AttachmentUploadIssueScreen({ navigation, route }: Props<"AttachmentUploadIssue">) {
  const issue = attachmentUploadIssue({ fileName: route.params?.fileName ?? "photo.jpg", mimeType: "image/jpeg", sizeBytes: route.params?.reason === "too_large" ? 12 * 1024 * 1024 : 1024 });
  return (
    <Shell testID="H116" title="Upload issue" navigation={navigation}>
      <HidiText variant="title">Attachment could not upload.</HidiText>
      <MessageCard>{issue.fileName}: {issue.reason}</MessageCard>
      <HidiButton label="Retry upload" disabled={!issue.retryable} onPress={() => safeBack(navigation)} />
      <QuietLink label="Remove file" onPress={() => safeBack(navigation)} />
    </Shell>
  );
}

export function EditorialStoryScreen({ navigation, route }: Props<"EditorialStory">) {
  return (
    <Shell testID="H117" title="Editorial story" navigation={navigation}>
      <HidiText variant="title">Soft tailoring for everyday movement.</HidiText>
      <HidiText variant="secondary">Story {route.params?.slug ?? "everyday-edit"} is readable even if products are later removed. Product references re-open live stock and pricing.</HidiText>
      <Panel title="Partnership label">
        <HidiText variant="metadata">Promotional partnerships are labeled. No autoplay and no scroll hijacking.</HidiText>
      </Panel>
      <HidiButton label="Shop this story" onPress={() => navigation.navigate("ShopTheLook", { lookId: "everyday-edit" })} />
    </Shell>
  );
}

export function ShopTheLookScreen({ navigation }: Props<"ShopTheLook">) {
  const [selected, setSelected] = useState<string[]>(["kurta"]);
  const components = useMemo(() => [
    { id: "kurta", productSlug: "sage-kurta", required: false, available: true, pricePaise: 169900 },
    { id: "dupatta", productSlug: "tonal-dupatta", required: false, available: true, pricePaise: 79900 },
    { id: "pants", productSlug: "straight-pants", required: false, available: false, pricePaise: 119900 },
  ], []);
  const summary = summarizeLookSelection(components, selected);
  return (
    <Shell testID="H118" title="Shop the look" navigation={navigation}>
      <HidiText variant="title">Choose each piece separately.</HidiText>
      <MessageCard>No hidden products or quantities are added. Unavailable pieces need your approval before continuing.</MessageCard>
      {components.map((item) => {
        const active = selected.includes(item.id);
        return <QuietLink key={item.id} label={(active ? "Selected · " : "Choose · ") + item.id + " · " + formatINRPaise(item.pricePaise) + (item.available ? "" : " · unavailable")} onPress={() => setSelected((current) => active ? current.filter((id) => id !== item.id) : [...current, item.id])} />;
      })}
      <Panel title="Selected total">
        <HidiText variant="secondary">{formatINRPaise(summary.totalPaise)}</HidiText>
        {summary.requiresApproval ? <HidiText variant="metadata">Some selected pieces are unavailable. Continue only with available pieces.</HidiText> : null}
      </Panel>
      <HidiButton label="Choose pieces" onPress={() => navigation.navigate("VariantPicker", { slug: components.find((item) => summary.selectedIds.includes(item.id))?.productSlug ?? "sage-kurta" })} />
    </Shell>
  );
}

export function AppearanceSettingsScreen({ navigation }: Props<"AppearanceSettings">) {
  const { preference, setPreference, colors } = useHidiTheme();
  const [saving, setSaving] = useState<AppearancePreference | null>(null);
  async function choose(value: AppearancePreference) {
    setSaving(value);
    await setPreference(value);
    setSaving(null);
  }
  return (
    <Shell testID="H121" title="Appearance" navigation={navigation}>
      <HidiText variant="title">Choose how HIDI looks.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Theme choice persists across launches and follows device text scaling.</HidiText>
      {appearanceChoices.map((choice) => (
        <QuietLink key={choice.value} label={(preference === choice.value ? "Selected · " : "Choose · ") + choice.label} onPress={() => void choose(choice.value)} />
      ))}
      <Panel title="Preview contrast">
        <HidiText variant="secondary">Canvas, surface, text and berry actions use semantic tokens rather than color inversion.</HidiText>
      </Panel>
      <HidiButton label={saving ? "Saving..." : "Save appearance"} disabled={Boolean(saving)} onPress={() => navigation.navigate("MyHidi")} />
    </Shell>
  );
}

export function HomeDarkAppearanceScreen({ navigation }: Props<"HomeDarkAppearance">) {
  const { colors, mode } = useHidiTheme();
  return (
    <Shell testID="H122" title="Home / dark appearance" navigation={navigation}>
      <HidiText variant="title">Dark appearance uses its own HIDI palette.</HidiText>
      <MessageCard>Current mode: {mode}. Product media stays natural; promotional art does not carry essential text.</MessageCard>
      <View style={[styles.darkHero, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <HidiText variant="display">Everyday edit</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Readable surfaces, distinct berry actions and preserved active tab state.</HidiText>
      </View>
      <HidiButton label="Shop the everyday edit" onPress={() => navigation.navigate("Collection", { slug: "everyday-edit", title: "Everyday edit" })} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  body: { gap: hidiSpacing.x4 },
  bold: { fontWeight: "600" },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: hidiRadius.card, padding: hidiSpacing.x4, gap: hidiSpacing.x2 },
  link: { minHeight: 44, justifyContent: "center" },
  skeletonStack: { gap: hidiSpacing.x3, marginVertical: hidiSpacing.x2 },
  skeleton: { height: 84, borderRadius: hidiRadius.card },
  darkHero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: hidiRadius.sheet, padding: hidiSpacing.x5, gap: hidiSpacing.x3 },
});
