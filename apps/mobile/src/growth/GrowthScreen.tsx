import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Clock3, Gift, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../auth/AuthContext";
import { useCart } from "../data/CartContext";
import { AppHeader } from "../components/AppHeader";
import { HidiScreen } from "../components/HidiScreen";
import { HidiText } from "../components/HidiText";
import { HidiButton } from "../components/HidiButton";
import { MessageCard } from "../components/MessageCard";
import { useHidiTheme } from "../theme/HidiTheme";
import type { RootStackParamList } from "../navigation/types";
import { canShareCampaign, CircleAccount, featureAvailable, freshUntil, GiftDraft, giftDraftError, giftFee, GiftOptions, GiftOutcome, GrowthAccess, GrowthFeature, GROWTH_SCREEN_IDS, noteLength, parseCircleAccount, parseGiftOptions, parseReferralCampaign, ReferralCampaign } from "./contracts";
import { createReferralShareAction } from "./operations";
import { useGiftSaveAction, useGrowthRuntime } from "./runtime";
import { useGrowthResource } from "./useGrowthResource";

const names = { circle: "HIDI Circle", referrals: "Invite a friend", gifting: "Gift note & packaging" };
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const app = AppState.addEventListener("change", () => setNow(Date.now()));
    return () => { clearInterval(timer); app.remove(); };
  }, []);
  return now;
}
function useCurrentScope() {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useCallback(() => mounted.current, []);
}
function Frame({ feature, onBack, children }: { feature: GrowthFeature; onBack: () => void; children: React.ReactNode }) {
  return <HidiScreen testID={GROWTH_SCREEN_IDS[feature]} contentStyle={styles.screen}>
    <AppHeader title={names[feature]} onBack={onBack} />
    <View style={styles.body}>{children}</View>
  </HidiScreen>;
}
function OptionalCaption() {
  const { colors } = useHidiTheme();
  return <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.1 }}>OPTIONAL · FEATURE-FLAGGED</HidiText>;
}
function PendingRead({ loading, error, onRetry }: { loading: boolean; error: boolean; onRetry: () => void }) {
  return <View style={styles.status}>
    <HidiText accessibilityLiveRegion="polite">{loading ? "Checking the latest details…" : "These details could not be refreshed. No reward or gift has been applied."}</HidiText>
    {error ? <HidiButton label="Try again" onPress={onRetry} /> : null}
  </View>;
}
function Secondary({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useHidiTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}><HidiText variant="action" style={{ color: colors.action }}>{label}</HidiText></Pressable>;
}

// These presentational views are exercised with clearly isolated test fixtures.
// Real navigation obtains data only from the reviewed, feature-gated adapter.
export function CircleView({ account, now, onRefresh }: { account: CircleAccount; now: number; onRefresh: () => void }) {
  const { colors } = useHidiTheme(); const [details, setDetails] = useState(false);
  const fresh = freshUntil(account.validUntil, now);
  return <>
    <OptionalCaption />
    <HidiText variant="title" accessibilityRole="header">A little thank-you.</HidiText>
    <HidiText variant="secondary">Welcome to HIDI Circle.</HidiText>
    <View style={[styles.panel, { backgroundColor: colors.blush, borderColor: colors.border }]}>
      <HidiText variant="metadata">AVAILABLE REWARD POINTS</HidiText>
      <HidiText variant="display">{account.availablePoints.toLocaleString("en-IN")}</HidiText>
      <HidiText variant="metadata">Rewards, not a cash balance.</HidiText>
    </View>
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Clock3 size={18} color={colors.action} /><HidiText style={styles.flex}>Pending points</HidiText><HidiText>{account.pendingPoints.toLocaleString("en-IN")}</HidiText>
    </View>
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <HidiText style={styles.flex}>Reversed points</HidiText><HidiText>{account.reversedPoints.toLocaleString("en-IN")}</HidiText>
    </View>
    {!fresh ? <MessageCard>Last updated {new Date(account.asOf).toLocaleString("en-IN")}. This saved view is informational; refresh for current rewards.</MessageCard> : null}
    <HidiText variant="secondary" accessibilityRole="header">How Circle works</HidiText>
    <HidiText variant="secondary">{account.policy.eligibility}</HidiText>
    <HidiText variant="secondary">{account.policy.expiry}</HidiText>
    <HidiText variant="secondary">{account.policy.reversals}</HidiText>
    {details ? <View testID="circle-ledger" style={styles.status}>
      <HidiText variant="secondary" accessibilityRole="header">Your activity</HidiText>
      {account.ledger.length ? account.ledger.map(event => <View key={event.eventId} style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <HidiText variant="secondary">{event.state[0].toUpperCase() + event.state.slice(1)} · {event.points} points</HidiText>
        <HidiText variant="metadata">{event.sourceReference}</HidiText>
        <HidiText variant="metadata">{new Date(event.occurredAt).toLocaleDateString("en-IN")}</HidiText>
        {event.expiresAt ? <HidiText variant="metadata">Expires {new Date(event.expiresAt).toLocaleDateString("en-IN")}</HidiText> : null}
      </View>) : <MessageCard>No reward activity has been returned for this account.</MessageCard>}
    </View> : null}
    <HidiButton label={details ? "Hide reward details" : "See reward details"} onPress={() => setDetails(value => !value)} />
    <Secondary label="Refresh rewards" onPress={onRefresh} />
  </>;
}
function CircleContent({ access }: { access: GrowthAccess }) {
  const runtime = useGrowthRuntime(); const now = useNow();
  const load = useCallback(async () => parseCircleAccount(await runtime.services.readCircle(access), access.subjectId), [access, runtime]);
  const resource = useGrowthResource(load);
  return resource.data ? <><CircleView account={resource.data} now={now} onRefresh={() => void resource.refresh()} />{resource.error ? <MessageCard>Rewards could not refresh. The displayed snapshot may be out of date.</MessageCard> : null}</> : <PendingRead {...resource} onRetry={() => void resource.refresh()} />;
}

export function ReferralView({ campaign, now, busy, message, onShare, onRefresh }: { campaign: ReferralCampaign; now: number; busy: boolean; message: string; onShare: () => void; onRefresh: () => void }) {
  const { colors } = useHidiTheme(); const eligible = canShareCampaign(campaign, now);
  return <>
    <OptionalCaption />
    <View style={[styles.giftIcon, { backgroundColor: colors.blush }]}><Gift size={32} color={colors.action} /></View>
    <HidiText variant="title" accessibilityRole="header" style={styles.center}>Good things, shared.</HidiText>
    <HidiText variant="secondary" style={styles.center}>Invite someone to discover HIDI. Any reward is subject to the active campaign terms.</HidiText>
    {eligible ? <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <HidiText variant="metadata" style={styles.center}>YOUR INVITATION</HidiText>
      <HidiText variant="title" selectable style={[styles.center, { letterSpacing: 2 }]}>{campaign.invitationCode}</HidiText>
    </View> : <MessageCard>This campaign is expired, not yet active, or unavailable for this account. No referral reward is promised.</MessageCard>}
    <HidiText variant="secondary">{campaign.terms}</HidiText>
    <HidiText variant="metadata">Campaign ends {new Date(campaign.endsAt).toLocaleString("en-IN")}.</HidiText>
    <MessageCard>We never access your contacts or send a message for you. You choose where to share.</MessageCard>
    {message ? <HidiText accessibilityLiveRegion="polite" variant="secondary">{message}</HidiText> : null}
    <HidiButton label="Share invitation" loading={busy} disabled={!eligible} onPress={onShare} />
    <Secondary label="Refresh campaign terms" onPress={onRefresh} />
  </>;
}
function ReferralContent({ access }: { access: GrowthAccess }) {
  const runtime = useGrowthRuntime(); const current = useCurrentScope(); const now = useNow();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const load = useCallback(async () => parseReferralCampaign(await runtime.services.readReferral(access), access.subjectId), [access, runtime]);
  const resource = useGrowthResource(load);
  const share = useMemo(() => createReferralShareAction(runtime, text => Share.share({ title: "Discover HIDI", message: text })), [runtime]);
  async function openShare() {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const result = await share(access, current);
      if (current()) setMessage(result === "dismissed" ? "Sharing cancelled. No invitation was sent by HIDI." : "Share sheet closed. HIDI cannot confirm delivery or award a reward from this action.");
    } catch { if (current()) setMessage("The invitation could not be shared. Refresh the campaign before trying again."); }
    finally { if (current()) setBusy(false); }
  }
  return resource.data ? <ReferralView campaign={resource.data} now={now} busy={busy} message={message} onShare={() => void openShare()} onRefresh={() => void resource.refresh()} /> : <PendingRead {...resource} onRetry={() => void resource.refresh()} />;
}

export function GiftForm({ options, draft, onDraft, busy, unknown, message, onSave, onReconcile, onBack, now }: { options: GiftOptions; draft: GiftDraft; onDraft: (draft: GiftDraft) => void; busy: boolean; unknown: boolean; message: string; onSave: () => void; onReconcile: () => void; onBack: () => void; now: number }) {
  const { colors } = useHidiTheme(); const error = giftDraftError(options, draft, now);
  const locked = busy || unknown; const remaining = options.maxNoteLength - noteLength(draft.note);
  return <>
    <HidiText variant="title" accessibilityRole="header">A thoughtful little extra.</HidiText>
    <HidiText variant="secondary">Optional touches for someone special.</HidiText>
    <HidiText variant="secondary">Gift note (optional)</HidiText>
    <TextInput testID="gift-note" accessibilityLabel="Gift note, optional" multiline editable={!locked && options.noteSupported} value={draft.note} onChangeText={note => onDraft({ ...draft, note })} placeholder="Write your gift note" placeholderTextColor={colors.mutedText} style={[styles.note, { color: colors.ink, backgroundColor: colors.surface, borderColor: remaining < 0 ? colors.error : colors.border }]} />
    <HidiText variant="metadata" accessibilityLiveRegion="polite">{remaining >= 0 ? remaining + " characters remaining" : Math.abs(remaining) + " characters over the limit"}</HidiText>
    <HidiText variant="secondary" accessibilityRole="header">Add gift packaging</HidiText>
    <HidiText variant="metadata">Extra packaging is optional and starts off. Prices below are supplied by HIDI.</HidiText>
    {[{ id: null, label: "No extra packaging", feePaise: 0, available: true }, ...options.packages].map(pack => <Pressable key={pack.id ?? "none"} testID={"gift-package-" + (pack.id ?? "none")} accessibilityRole="radio" accessibilityState={{ selected: draft.packagingId === pack.id, disabled: locked || !pack.available }} disabled={locked || !pack.available} onPress={() => onDraft({ ...draft, packagingId: pack.id })} style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.flex}><HidiText variant="secondary">{pack.label}</HidiText><HidiText variant="metadata">{pack.available ? "₹" + (pack.feePaise / 100).toFixed(2) : "Not available for this bag"}</HidiText></View>
      <View style={[styles.radio, { borderColor: colors.action }]}>{draft.packagingId === pack.id ? <View style={[styles.dot, { backgroundColor: colors.action }]} /> : null}</View>
    </Pressable>)}
    {options.unsupportedItems.length ? <MessageCard>{"Gifting is not supported for: " + options.unsupportedItems.join(", ")}</MessageCard> : null}
    <MessageCard>The final server quote must include the approved gift fee. Fulfillment must receive this exact note before we show it as saved.</MessageCard>
    {error ? <HidiText variant="secondary" style={{ color: colors.error }}>{error}</HidiText> : null}
    {message ? <HidiText accessibilityLiveRegion="polite" variant="secondary">{message}</HidiText> : null}
    {unknown ? <HidiButton label="Check gift status" loading={busy} onPress={onReconcile} /> : <HidiButton label="Save gift options" loading={busy} disabled={Boolean(error)} onPress={onSave} />}
    <Secondary label="Back to bag" onPress={onBack} />
  </>;
}
function GiftEditor({ access, initial, onBack }: { access: GrowthAccess; initial: GiftOptions; onBack: () => void }) {
  const action = useGiftSaveAction(); const current = useCurrentScope(); const now = useNow();
  const [options, setOptions] = useState(initial);
  const [draft, setDraft] = useState<GiftDraft>({ ...initial.selected });
  const [busy, setBusy] = useState(false); const [unknown, setUnknown] = useState(action.hasPending());
  const [message, setMessage] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const { refresh } = useCart();
  async function handle(result: GiftOutcome) {
    if (!current()) return;
    if (result.kind === "unknown") { setUnknown(true); setMessage("The result is still uncertain. Do not save again; check the existing operation."); return; }
    if (result.kind === "fee-changed") {
      const previousFee = (() => { try { return giftFee(options, draft); } catch { return null; } })();
      setOptions(result.options); setUnknown(false);
      setMessage("Gift options or their fee changed" + (previousFee === null ? "." : " (previous fee ₹" + (previousFee / 100).toFixed(2) + ").") + " Review the updated options. Save again only to approve them."); return;
    }
    setConfirmed(true); setUnknown(false);
    setMessage("Gift options confirmed by HIDI. Gift fee in the server quote: ₹" + (result.confirmation.giftFeePaise / 100).toFixed(2) + ".");
    // Never inject a fee into the local cart arithmetic; read the canonical bag.
    await refresh();
  }
  async function submit(reconcile: boolean) {
    if (busy) return; setBusy(true);
    try {
      const result = reconcile ? await action.reconcile(access, current)
        : await action.save(access, options, draft, "gift-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2), current);
      await handle(result);
    } catch { if (current()) setMessage("Gift options could not be verified. Your note is still here; review your bag before continuing."); }
    finally { if (current()) setBusy(false); }
  }
  if (confirmed) return <><ShieldCheck size={32} /><HidiText variant="title">Gift options saved.</HidiText><MessageCard tone="success">{message}</MessageCard><HidiButton label="Back to bag" onPress={onBack} /></>;
  return <GiftForm options={options} draft={draft} onDraft={setDraft} busy={busy} unknown={unknown} message={message} onSave={() => void submit(false)} onReconcile={() => void submit(true)} onBack={onBack} now={now} />;
}
function GiftContent({ access, onBack }: { access: GrowthAccess; onBack: () => void }) {
  const runtime = useGrowthRuntime();
  const load = useCallback(async () => parseGiftOptions(await runtime.services.readGift(access), access.cartId!), [access, runtime]);
  const resource = useGrowthResource(load);
  return resource.data ? <GiftEditor access={access} initial={resource.data} onBack={onBack} /> : <PendingRead {...resource} onRetry={() => void resource.refresh()} />;
}

export default function GrowthScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "Growth">) {
  const runtime = useGrowthRuntime(); const auth = useAuth(); const bag = useCart();
  const feature = route.params.feature;
  const access = useMemo<GrowthAccess>(() => ({ subjectId: auth.session?.user.id ?? "guest", accessToken: auth.session?.access_token ?? "", cartId: bag.cart?.id ?? undefined }), [auth.session?.user.id, auth.session?.access_token, bag.cart?.id]);
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MainTabs", { screen: feature === "gifting" ? "Bag" : "You" });
  const allowed = featureAvailable(feature, runtime.flags, runtime.capabilities);
  let body: React.ReactNode;
  if (!allowed) body = <><OptionalCaption /><HidiText variant="title">{names[feature]}</HidiText><MessageCard>This optional feature is not active. It needs approved terms and a supported HIDI service before it can be used.</MessageCard><HidiButton label={feature === "gifting" ? "Back to bag" : "Back to My HIDI"} onPress={back} /></>;
  else if (feature !== "gifting" && !auth.session) body = <><HidiText variant="title">Sign in to {names[feature]}.</HidiText><MessageCard>Browsing does not require sign-in. Rewards and invitations use only your verified account.</MessageCard><HidiButton label="Sign in" onPress={() => navigation.navigate("SignIn")} /></>;
  else if (feature === "gifting" && (!access.cartId || bag.stale || bag.busyKey || !(bag.cart?.itemCount))) body = <><HidiText variant="title">Review your bag first.</HidiText><MessageCard>A current, non-empty bag is required before choosing gift options.</MessageCard><HidiButton label="Back to bag" onPress={back} /></>;
  else body = feature === "circle" ? <CircleContent key={access.subjectId} access={access} /> : feature === "referrals" ? <ReferralContent key={access.subjectId} access={access} /> : <GiftContent key={access.subjectId + ":" + access.cartId} access={access} onBack={back} />;
  return <Frame feature={feature} onBack={back}>{body}</Frame>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 }, body: { paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  center: { textAlign: "center" }, flex: { flex: 1 }, status: { gap: 12, paddingVertical: 14 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 18, gap: 8 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  giftIcon: { width: 76, height: 76, borderRadius: 38, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 16 },
  note: { borderWidth: 1, borderRadius: 8, minHeight: 112, fontSize: 16, padding: 14, textAlignVertical: "top" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
