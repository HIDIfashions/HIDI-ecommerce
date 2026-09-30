import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps, NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { CatalogSkeleton } from "../../components/StateViews";
import { ProductGrid } from "../../components/ProductGrid";
import { useHidiTheme } from "../../theme/HidiTheme";
import { hidiColors } from "../../theme/tokens";
import { useCatalog } from "../../data/CatalogContext";
import { appearanceChoices, permissionDeclinedCopy, linkUnavailableReason } from "../../models/system";
import type { AppearancePreference } from "../../models/system";
import { systemStorage } from "../../storage/systemStorage";
import type { RootStackParamList } from "../../navigation/types";
type Props<Name extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, Name>;
type Navigation = Pick<NativeStackNavigationProp<RootStackParamList>, "goBack" | "navigate" | "canGoBack">;
function back(navigation: Navigation) { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate("MainTabs", { screen: "Home" }); }
function Shell({ title, testID, navigation, children }: { title: string; testID: string; navigation: Navigation; children: React.ReactNode }) {
  return <HidiScreen testID={testID} contentStyle={styles.body}><AppHeader title={title} onBack={() => back(navigation)} />{children}</HidiScreen>;
}
function QuietLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}><HidiText variant="secondary" style={{ color: colors.action }}>{label}</HidiText></Pressable>;
}
function CatalogRecovery({ navigation, label = "Retry catalogue" }: { navigation: Navigation; label?: string }) {
  const catalog = useCatalog(); const [busy, setBusy] = useState(false);
  async function retry() { setBusy(true); try { await catalog.refresh(); navigation.navigate("MainTabs", { screen: "Home" }); } finally { setBusy(false); } }
  return <HidiButton label={label} loading={busy} onPress={() => void retry()} />;
}
export function LoadingSkeletonScreen({ navigation }: Props<"LoadingSkeleton">) {
  return <Shell testID="H103" title="Loading" navigation={navigation}><HidiText variant="title">Loading HIDI.</HidiText><CatalogSkeleton /><QuietLink label="Back to shopping" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} /></Shell>;
}
export function PartialLoadFailureScreen({ navigation, route }: Props<"PartialLoadFailure">) {
  const { state } = useCatalog();
  return <Shell testID="H104" title="Section could not load" navigation={navigation}>
    <HidiText variant="title">Part of the page could not refresh.</HidiText>
    <MessageCard>{route.params?.section ?? "This section"} did not load. Your bag and any existing payment attempt are unchanged.</MessageCard>
    {state.kind === "content" ? <ProductGrid products={state.data.slice(0, 4)} onOpen={p => navigation.navigate("ProductDeferred", { slug: p.slug })} /> : null}
    <CatalogRecovery navigation={navigation} />
  </Shell>;
}
export function OfflineSavedContentScreen({ navigation }: Props<"OfflineSavedContent">) {
  const { state } = useCatalog(); const available = state.kind === "content" && state.data.length > 0;
  return <Shell testID="H105" title="Saved catalogue" navigation={navigation}>
    <HidiText variant="title">{available ? "Browse the last loaded catalogue." : "No saved catalogue is available."}</HidiText>
    <MessageCard>Saved prices and availability may have changed. Only a fresh online response can confirm a bag update, payment or return.</MessageCard>
    {state.kind === "content" ? <ProductGrid products={state.data.slice(0, 4)} onOpen={p => navigation.navigate("ProductDeferred", { slug: p.slug })} /> : null}
    <CatalogRecovery navigation={navigation} label="Retry connection" />
  </Shell>;
}
export function OfflineEmptyScreen({ navigation }: Props<"OfflineEmpty">) {
  return <Shell testID="H106" title="No connection" navigation={navigation}><HidiText variant="title">A connection is needed to load this.</HidiText><MessageCard>No order or payment is retried when you check the catalogue connection.</MessageCard><CatalogRecovery navigation={navigation} label="Try connection again" /></Shell>;
}
export function GenericErrorScreen({ navigation, route }: Props<"GenericError">) {
  const requestId = route.params?.requestId && /^[a-zA-Z0-9_-]{1,100}$/.test(route.params.requestId) ? route.params.requestId : null;
  return <Shell testID="H107" title="Something went wrong" navigation={navigation}><HidiText variant="title">This view could not load.</HidiText><MessageCard>{requestId ? "Support reference: " + requestId : "No support reference was returned for this issue."} An uncertain payment is not retried from this screen.</MessageCard><HidiButton label="Back to shopping" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} /><QuietLink label="Contact HIDI" onPress={() => navigation.navigate("ContactHidi")} /></Shell>;
}
export function SessionExpiredScreen({ navigation, route }: Props<"SessionExpired">) {
  return <Shell testID="H108" title="Verify again" navigation={navigation}><HidiText variant="title">Sign in again to access your account.</HidiText><MessageCard>Public browsing remains available. Signing in never automatically submits a payment, return or cancellation.</MessageCard><HidiButton label="Verify again" onPress={() => navigation.navigate("SignIn", route.params?.returnTo ? { returnTo: route.params.returnTo } : undefined)} /><QuietLink label="Continue browsing" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} /></Shell>;
}
export function MaintenanceScreen({ navigation, route }: Props<"Maintenance">) {
  return <Shell testID="H109" title="Service unavailable" navigation={navigation}><HidiText variant="title">Some services are temporarily unavailable.</HidiText><MessageCard>{route.params?.estimate ? "Service update: " + route.params.estimate : "No confirmed recovery time is available."} No payment is retried here.</MessageCard><CatalogRecovery navigation={navigation} label="Check catalogue again" /><QuietLink label="Contact HIDI" onPress={() => navigation.navigate("ContactHidi")} /></Shell>;
}
export function RequiredUpdateScreen({ navigation }: Props<"RequiredUpdate">) {
  return <Shell testID="H110" title="App update" navigation={navigation}><HidiText variant="title">Verified update information is unavailable.</HidiText><MessageCard>This build has no approved remote minimum-version or store-link contract. HIDI does not invent an update requirement or send you to an unverified download.</MessageCard><HidiButton label="Back to shopping" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} /></Shell>;
}
export function UpdateAvailableScreen({ navigation }: Props<"UpdateAvailable">) {
  const [error, setError] = useState("");
  async function dismiss() { try { await systemStorage.dismissOptionalUpdate(); back(navigation); } catch { setError("This choice could not be saved. You may still go back."); } }
  return <Shell testID="H111" title="App updates" navigation={navigation}><HidiText variant="title">No verified update notice is available.</HidiText><MessageCard>Release notes and an update destination are shown only when an approved update source provides them.</MessageCard>{error ? <MessageCard tone="error">{error}</MessageCard> : null}<HidiButton label="Not now" onPress={() => void dismiss()} /></Shell>;
}
export function PermissionExplanationScreen({ navigation, route }: Props<"PermissionExplanation">) {
  const photos = route.params?.feature === "photos";
  return <Shell testID="H112" title="Permission explanation" navigation={navigation}><HidiText variant="title">Choose access only when useful.</HidiText><MessageCard>{photos ? "Photo attachments need the approved photo-picker/upload flow. This build does not yet expose that provider integration." : "Notification delivery needs the approved push provider. Browsing and order lookup do not require notification permission."} HIDI does not request contacts or send an automatic first-launch prompt.</MessageCard><HidiButton label="Continue without it" onPress={() => back(navigation)} /><QuietLink label="Permission settings" onPress={() => navigation.navigate("AndroidPermissionDialog", route.params?.returnTo ? { returnTo: route.params.returnTo } : undefined)} /></Shell>;
}
export function PermissionDeclinedScreen({ navigation, route }: Props<"PermissionDeclined">) {
  const [error, setError] = useState("");
  return <Shell testID="H113" title="Permission declined" navigation={navigation}><HidiText variant="title">You can continue without it.</HidiText><MessageCard>{permissionDeclinedCopy(route.params?.feature ?? "notifications")}</MessageCard><HidiButton label="Continue without it" onPress={() => back(navigation)} /><QuietLink label="Open app settings" onPress={() => void Linking.openSettings().catch(() => setError("Settings could not be opened. Use your device Settings app."))} />{error ? <MessageCard tone="error">{error}</MessageCard> : null}</Shell>;
}
export function LinkUnavailableScreen({ navigation, route }: Props<"LinkUnavailable">) {
  return <Shell testID="H114" title="Link unavailable" navigation={navigation}><HidiText variant="title">This link cannot be opened.</HidiText><MessageCard>{linkUnavailableReason(route.params?.reason ?? "unknown")}</MessageCard><HidiButton label="Browse HIDI" onPress={() => navigation.navigate("MainTabs", { screen: "Shop" })} /></Shell>;
}
export function TooManyRequestsScreen({ navigation, route }: Props<"TooManyRequests">) {
  const delay = Math.min(1800, Math.max(0, route.params?.retryAfterSeconds ?? 0));
  const [deadline] = useState(() => Date.now() + delay * 1000); const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <Shell testID="H115" title="Temporary request limit" navigation={navigation}><HidiText variant="title">Please pause before retrying.</HidiText><MessageCard>{remaining ? "Service cooldown: " + remaining + " seconds remaining." : "Return to the original action to check its current status."} No previous write is replayed here.</MessageCard><HidiButton label="Continue browsing" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} /><QuietLink label="Contact HIDI" onPress={() => navigation.navigate("ContactHidi")} /></Shell>;
}
export function AttachmentUploadIssueScreen({ navigation, route }: Props<"AttachmentUploadIssue">) {
  return <Shell testID="H116" title="Attachment issue" navigation={navigation}><HidiText variant="title">The attachment has not been submitted.</HidiText><MessageCard>{route.params?.fileName ? "Selected file: " + route.params.fileName + ". " : ""}The current build has no approved upload adapter. Returning to the draft does not claim that a file was uploaded or removed.</MessageCard><HidiButton label="Return to draft" onPress={() => back(navigation)} /></Shell>;
}
export function EditorialStoryScreen({ navigation }: Props<"EditorialStory">) {
  return <Shell testID="H117" title="HIDI stories" navigation={navigation}><HidiText variant="title">This story is not currently published in the app.</HidiText><MessageCard>No approved editorial-content contract is connected. Product descriptions and a synthetic story are not substituted for a published article.</MessageCard><HidiButton label="Explore current styles" onPress={() => navigation.navigate("Listing", { title: "Shop all" })} /></Shell>;
}
export function ShopTheLookScreen({ navigation }: Props<"ShopTheLook">) {
  const { state } = useCatalog();
  return <Shell testID="H118" title="Shop the look" navigation={navigation}><HidiText variant="title">No published look is available yet.</HidiText><MessageCard>HIDI has not returned an approved set of look components. These are current catalogue styles, not a fabricated bundle; opening one lets you select its exact size before adding it.</MessageCard>{state.kind === "content" ? <ProductGrid products={state.data.slice(0, 4)} onOpen={p => navigation.navigate("ProductDeferred", { slug: p.slug })} /> : null}<HidiButton label="Browse all styles" onPress={() => navigation.navigate("Listing", { title: "Shop all" })} /></Shell>;
}
export function AppearanceSettingsScreen({ navigation }: Props<"AppearanceSettings">) {
  const { preference, setPreference } = useHidiTheme(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function choose(value: AppearancePreference) { if (busy) return; setBusy(true); setError(""); try { await setPreference(value); } catch { setError("Appearance could not be saved on this device."); } finally { setBusy(false); } }
  return <Shell testID="H121" title="Appearance" navigation={navigation}><HidiText variant="title">Choose how HIDI looks.</HidiText>{appearanceChoices.map(choice => <QuietLink key={choice.value} label={(preference === choice.value ? "Selected · " : "Choose · ") + choice.label} onPress={() => void choose(choice.value)} />)}{error ? <MessageCard tone="error">{error}</MessageCard> : null}<HidiButton label="Done" disabled={busy} onPress={() => back(navigation)} /></Shell>;
}
export function HomeDarkAppearanceScreen({ navigation }: Props<"HomeDarkAppearance">) {
  const { setPreference } = useHidiTheme(); const [error, setError] = useState(""); const dark = hidiColors.dark;
  async function useDark() { try { await setPreference("dark"); navigation.navigate("MainTabs", { screen: "Home" }); } catch { setError("Dark appearance could not be saved."); } }
  return <Shell testID="H122" title="Dark appearance preview" navigation={navigation}><View style={[styles.preview, { backgroundColor: dark.canvas, borderColor: dark.border }]}><HidiText variant="title" style={{ color: dark.ink }}>HIDI after dark.</HidiText><HidiText variant="body" style={{ color: dark.ink }}>A preview of the dark canvas and readable text. Product photographs keep their original colours.</HidiText></View>{error ? <MessageCard tone="error">{error}</MessageCard> : null}<HidiButton label="Use dark appearance" onPress={() => void useDark()} /><QuietLink label="Keep current appearance" onPress={() => back(navigation)} /></Shell>;
}
const styles = StyleSheet.create({ body: { gap: 16, paddingHorizontal: 20, paddingBottom: 36 }, link: { minHeight: 48, justifyContent: "center", paddingVertical: 10 }, preview: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 12 } });
