import React, { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bell, ChevronRight, HelpCircle, MapPin, ShieldCheck, UserRound } from "lucide-react-native";
import { AppHeader } from "../../components/AppHeader";
import { HidiButton } from "../../components/HidiButton";
import { HidiField } from "../../components/HidiField";
import { HidiScreen } from "../../components/HidiScreen";
import { HidiText } from "../../components/HidiText";
import { MessageCard } from "../../components/MessageCard";
import { ToggleRow } from "../../components/ToggleRow";
import { useAuth } from "../../auth/AuthContext";
import { maskPhone, updateProfile } from "../../auth/session";
import { checkoutStorage } from "../../storage/checkoutStorage";
import { localStore } from "../../storage/localStore";
import { accountStorage, defaultNotificationPreference, defaultPrivacyPreference } from "../../storage/accountStorage";
import {
  canSubmitSupportDraft,
  makeOperationId,
  normalizeOptionalEmail,
  phase5Capabilities,
  safeGuestOrderLookup,
  sanitizeSupportText,
} from "../../models/account";
import type { NotificationPreference, PrivacyPreference, SupportTicketDraft } from "../../models/account";
import type { CheckoutAddress } from "../../models/checkout";
import { addressSummary } from "../../models/checkout";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props<Name extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, Name>;

type BasicNavigation = {
  navigate: (name: string, params?: unknown) => void;
  replace?: (name: string, params?: unknown) => void;
  goBack?: () => void;
  reset?: (state: unknown) => void;
};

function go(navigation: BasicNavigation, name: keyof RootStackParamList, params?: unknown) {
  navigation.navigate(String(name), params);
}

function replaceWith(navigation: BasicNavigation, name: keyof RootStackParamList, params?: unknown) {
  if (navigation.replace) navigation.replace(String(name), params);
  else navigation.navigate(String(name), params);
}

function Shell({ title, testID, onBack, children }: { title: string; testID: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <HidiScreen testID={testID} contentStyle={styles.zero}>
      <AppHeader title={title} onBack={onBack} />
      <View style={styles.body}>{children}</View>
    </HidiScreen>
  );
}

function Row({ title, detail, onPress, icon }: { title: string; detail?: string; onPress: () => void; icon?: React.ReactNode }) {
  const { colors } = useHidiTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]}> 
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <HidiText variant="secondary" style={styles.bold}>{title}</HidiText>
        {detail ? <HidiText variant="metadata" style={{ color: colors.mutedText }}>{detail}</HidiText> : null}
      </View>
      <ChevronRight size={18} color={colors.mutedText} />
    </Pressable>
  );
}

function CapabilityNotice({ capability, supportedCopy }: { capability: keyof typeof phase5Capabilities; supportedCopy: string }) {
  const state = phase5Capabilities[capability];
  if (state === "supported") return <MessageCard tone="success">{supportedCopy}</MessageCard>;
  const copy = state === "provider-owned"
    ? "This is handled by the secure payment provider. HIDI does not receive full payment credentials."
    : state === "local-device-only"
      ? "This currently uses local-device data only. It is not a server-synced account capability yet."
      : "The current HIDI API does not expose this server capability, so the app does not pretend the action was submitted.";
  return <MessageCard>{copy}</MessageCard>;
}

function displayAddressName(address: CheckoutAddress) {
  return address.firstName + (address.lastName ? " " + address.lastName : "");
}

export function AccountHomeScreen({ navigation }: { navigation: BasicNavigation }) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [summaryError, setSummaryError] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const name = typeof auth.session?.user.user_metadata?.first_name === "string" ? String(auth.session.user.user_metadata.first_name).trim() : "";

  useEffect(() => {
    let alive = true;
    void localStore.wishlist().then((items) => { if (alive) setSavedCount(items.length); }).catch(() => { if (alive) setSummaryError(true); });
    return () => { alive = false; };
  }, []);

  if (!auth.session) return <GuestAccountScreen navigation={navigation as never} route={{ key: "GuestAccount", name: "GuestAccount" } as never} />;

  return (
    <ScrollView testID="H083" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.scrollBody}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>MY HIDI</HidiText>
      <HidiText variant="title">{name ? "Hello, " + name + "." : "Hello."}</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{auth.session.user.phone ? maskPhone(auth.session.user.phone) : "Signed in securely"}</HidiText>
      {summaryError ? <MessageCard tone="error">Account summary could not refresh. Sign-out and help remain available.</MessageCard> : null}
      <View style={styles.cardGroup}>
        <Row title="My orders" detail="View current and past orders" onPress={() => go(navigation, "MyOrders")} icon={<UserRound size={18} color={colors.action} />} />
        <Row title="Saved items" detail={savedCount + " saved on this device"} onPress={() => go(navigation, "MainTabs", { screen: "Saved" })} />
        <Row title="Addresses" detail="Manage delivery addresses" onPress={() => go(navigation, "ManageAddresses")} icon={<MapPin size={18} color={colors.action} />} />
        <Row title="Shopping preferences" detail="Interests, sizes and history controls" onPress={() => go(navigation, "ShoppingPreferences")} />
        <Row title="Notifications" detail="Inbox and channel settings" onPress={() => go(navigation, "NotificationsInbox")} icon={<Bell size={18} color={colors.action} />} />
        <Row title="Help centre" detail="Orders, payment, delivery and support" onPress={() => go(navigation, "HelpCentre")} icon={<HelpCircle size={18} color={colors.action} />} />
        <Row title="Privacy choices" detail="Consent, export and deletion" onPress={() => go(navigation, "PrivacyChoices")} icon={<ShieldCheck size={18} color={colors.action} />} />
        <Row title="Edit profile" detail="Name, email and phone settings" onPress={() => go(navigation, "EditProfile")} />
        <Row title="Sign out" detail="Clear local account session on this device" onPress={() => go(navigation, "SignOutConfirm")} />
      </View>
    </ScrollView>
  );
}

export function GuestAccountScreen({ navigation }: Props<"GuestAccount">) {
  const { colors } = useHidiTheme();
  return (
    <ScrollView testID="H084" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.scrollBody}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>GUEST HIDI</HidiText>
      <HidiText variant="title">Browse freely. Sign in only when useful.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Sync favourites, addresses and order access when you choose. Help and guest order lookup stay available without marketing opt-in.</HidiText>
      <HidiButton label="Sign in / join HIDI" onPress={() => go(navigation, "SignIn")} />
      <View style={styles.cardGroup}>
        <Row title="Find a guest order" detail="Use reference plus verified contact" onPress={() => go(navigation, "FindGuestOrder")} />
        <Row title="Help centre" detail="Payment, delivery, returns and support" onPress={() => go(navigation, "HelpCentre")} />
        <Row title="Policies & legal" detail="Shipping, returns, privacy and merchant details" onPress={() => go(navigation, "PoliciesLegal")} />
        <Row title="Contact HIDI" detail="Use the supported async route" onPress={() => go(navigation, "ContactHidi")} />
      </View>
    </ScrollView>
  );
}

export function EditProfileScreen({ navigation }: Props<"EditProfile">) {
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const [name, setName] = useState(typeof auth.session?.user.user_metadata?.first_name === "string" ? String(auth.session.user.user_metadata.first_name) : "");
  const [email, setEmail] = useState(auth.session?.user.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("");
    try {
      const normalizedEmail = normalizeOptionalEmail(email);
      setBusy(true);
      const session = await updateProfile({ preferredName: name, email: normalizedEmail ?? undefined });
      auth.setSession(session);
      go(navigation, "MyHidi");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save profile.");
    } finally { setBusy(false); }
  }

  return (
    <Shell testID="H085" title="Edit profile" onBack={navigation.goBack}>
      <HidiText variant="title">Your profile.</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>Preferred name and optional email only. Phone changes use a separate secure flow.</HidiText>
      <HidiField label="Preferred name" value={name} onChangeText={setName} autoCapitalize="words" />
      <HidiField label="Email address (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Row title="Change phone number" detail="Requires secure re-verification" onPress={() => go(navigation, "ChangePhoneNumber")} />
      <Row title="Verify email address" detail="Optional receipts and account messages" onPress={() => go(navigation, "VerifyEmailAddress", { email })} />
      {message ? <MessageCard tone="error">{message}</MessageCard> : null}
      <HidiButton label="Save changes" loading={busy} onPress={() => void save()} />
    </Shell>
  );
}

export function ManageAddressesScreen({ navigation }: Props<"ManageAddresses">) {
  const { colors } = useHidiTheme();
  const [items, setItems] = useState<CheckoutAddress[]>([]);
  const [message, setMessage] = useState("");
  async function load() { setItems(await checkoutStorage.addresses()); }
  useEffect(() => { void load(); }, []);
  async function remove(id: string) { await checkoutStorage.deleteAddress(id); await load(); setMessage("Address removed from this device. Past order snapshots are unchanged."); }
  async function makeDefault(id: string) { await checkoutStorage.setDefaultAddress(id); await load(); }
  return (
    <Shell testID="H086" title="Manage addresses" onBack={navigation.goBack}>
      <HidiText variant="title">Delivery addresses.</HidiText>
      <CapabilityNotice capability="addressBook" supportedCopy="Address book is synced." />
      {message ? <MessageCard tone="success">{message}</MessageCard> : null}
      {items.length ? items.map((item) => (
        <View key={item.id} style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <HidiText variant="secondary" style={styles.bold}>{displayAddressName(item)}{item.isDefault ? " · Default" : ""}</HidiText>
          <HidiText variant="metadata">{addressSummary(item)}</HidiText>
          <View style={styles.inlineActions}>
            <Pressable accessibilityRole="button" onPress={() => go(navigation, "AddAddress")} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.action }}>Edit</HidiText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void makeDefault(item.id)} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.action }}>Make default</HidiText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void remove(item.id)} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.error }}>Delete</HidiText></Pressable>
          </View>
        </View>
      )) : <MessageCard>No saved addresses yet. Add one when you checkout or create it now.</MessageCard>}
      <HidiButton label="Add address" onPress={() => go(navigation, "AddAddress")} />
    </Shell>
  );
}

export function SavedPaymentMethodsScreen({ navigation }: Props<"SavedPaymentMethods">) {
  return (
    <Shell testID="H087" title="Saved payment methods" onBack={navigation.goBack}>
      <HidiText variant="title">Secure payment methods.</HidiText>
      <CapabilityNotice capability="paymentMethodTokens" supportedCopy="Provider-tokenized methods are available." />
      <MessageCard>No saved payment methods are returned by the current HIDI API. You can still choose a fresh provider-owned payment method at checkout.</MessageCard>
      <HidiButton label="Back to My HIDI" onPress={() => go(navigation, "MyHidi")} />
    </Shell>
  );
}

export function ShoppingPreferencesScreen({ navigation }: Props<"ShoppingPreferences">) {
  const [interests, setInterests] = useState<string[]>([]);
  const [recent, setRecent] = useState(true);
  const [searches, setSearches] = useState(true);
  useEffect(() => { void Promise.all([localStore.stylePreferences(), localStore.recentTrackingEnabled(), localStore.searchTrackingEnabled()]).then(([i, r, s]) => { setInterests(i); setRecent(r); setSearches(s); }); }, []);
  async function save() { await localStore.saveStylePreferences(interests); await localStore.setRecentTrackingEnabled(recent); await localStore.setSearchTrackingEnabled(searches); go(navigation, "MyHidi"); }
  return (
    <Shell testID="H088" title="Shopping preferences" onBack={navigation.goBack}>
      <HidiText variant="title">Make HIDI yours.</HidiText>
      <CapabilityNotice capability="addressBook" supportedCopy="Shopping preferences are synced." />
      {["Everyday ease", "Soft tailoring", "Occasion dressing", "Indian wear", "Accessories"].map((label) => {
        const selected = interests.includes(label);
        return <ToggleRow key={label} title={label} detail="Personalize discovery" value={selected} onValueChange={(v) => setInterests((cur) => v ? [...cur.filter((x) => x !== label), label] : cur.filter((x) => x !== label))} />;
      })}
      <ToggleRow title="Remember recently viewed" detail="Local-device history" value={recent} onValueChange={setRecent} />
      <ToggleRow title="Remember searches" detail="Local-device search history" value={searches} onValueChange={setSearches} />
      <HidiButton label="Save preferences" onPress={() => void save()} />
    </Shell>
  );
}

export function NotificationsInboxScreen({ navigation }: Props<"NotificationsInbox">) {
  const { colors } = useHidiTheme();
  return (
    <Shell testID="H089" title="Notifications" onBack={navigation.goBack}>
      <HidiText variant="title">Nothing urgent.</HidiText>
      <CapabilityNotice capability="notificationsApi" supportedCopy="Notifications are synced." />
      <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}><HidiText variant="secondary">Service messages will appear here when notification sync is connected.</HidiText></View>
      <HidiButton label="Notification settings" onPress={() => go(navigation, "NotificationSettings")} />
    </Shell>
  );
}

export function NotificationSettingsScreen({ navigation }: Props<"NotificationSettings">) {
  const [pref, setPref] = useState<NotificationPreference>(defaultNotificationPreference);
  useEffect(() => { void accountStorage.notificationPreferences().then(setPref); }, []);
  async function save() { await accountStorage.saveNotificationPreferences(pref); go(navigation, "NotificationsInbox"); }
  return (
    <Shell testID="H090" title="Notification settings" onBack={navigation.goBack}>
      <HidiText variant="title">Choose what reaches you.</HidiText>
      <CapabilityNotice capability="notificationsApi" supportedCopy="Notification channels are synced." />
      <ToggleRow title="SMS order updates" detail="Delivery and payment service messages" value={pref.orderSms} onValueChange={(v) => setPref((p) => ({ ...p, orderSms: v }))} />
      <ToggleRow title="WhatsApp order updates" detail="Service messages only" value={pref.orderWhatsApp} onValueChange={(v) => setPref((p) => ({ ...p, orderWhatsApp: v }))} />
      <ToggleRow title="Promotions" detail="Optional marketing only" value={pref.promotional} onValueChange={(v) => setPref((p) => ({ ...p, promotional: v }))} />
      <HidiButton label="Save settings" onPress={() => void save()} />
      <Row title="OS notification permission" detail="Open permission education" onPress={() => go(navigation, "AndroidPermissionDialog", { returnTo: "NotificationSettings" })} />
    </Shell>
  );
}

export function AndroidPermissionDialogScreen({ navigation }: Props<"AndroidPermissionDialog">) {
  return (
    <Shell testID="H091" title="Permission handoff" onBack={navigation.goBack}>
      <HidiText variant="title">Turn on notifications only when useful.</HidiText>
      <MessageCard>HIDI will request OS notification permission only after this explanation. The current build shows the education state; native permission request wiring belongs to release hardening.</MessageCard>
      <HidiButton label="Back to settings" onPress={() => go(navigation, "NotificationSettings")} />
    </Shell>
  );
}

export function HelpCentreScreen({ navigation }: Props<"HelpCentre">) {
  return (
    <Shell testID="H092" title="Help centre" onBack={navigation.goBack}>
      <HidiText variant="title">How can we help?</HidiText>
      <CapabilityNotice capability="helpTopicsApi" supportedCopy="Help topics are synced." />
      <Row title="I need help with an order" detail="Use order context when available" onPress={() => go(navigation, "HelpWithOrder")} />
      <Row title="Create support request" detail="Question, bug, delivery or payment concern" onPress={() => go(navigation, "CreateSupportRequest")} />
      <Row title="Contact HIDI" detail="Email and website route" onPress={() => go(navigation, "ContactHidi")} />
      <Row title="Policies & legal" detail="Return, shipping and privacy" onPress={() => go(navigation, "PoliciesLegal")} />
    </Shell>
  );
}

export function HelpWithOrderScreen({ navigation }: Props<"HelpWithOrder">) {
  return (
    <Shell testID="H093" title="Order help" onBack={navigation.goBack}>
      <HidiText variant="title">Use the exact order when possible.</HidiText>
      <MessageCard>Order-specific help is available from an order detail screen. Guest lookup requires a reference and a verified contact before showing private details.</MessageCard>
      <HidiButton label="Find guest order" onPress={() => go(navigation, "FindGuestOrder")} />
    </Shell>
  );
}

export function CreateSupportRequestScreen({ navigation, route }: Props<"CreateSupportRequest">) {
  const [topic, setTopic] = useState(route.params?.topic ?? "General");
  const [subject, setSubject] = useState(route.params?.orderNumber ? "Help with order " + route.params.orderNumber : "");
  const [body, setBody] = useState("");
  const [result, setResult] = useState("");
  async function submit() {
    const cleanSubject = sanitizeSupportText(subject, 120) || topic;
    const cleanBody = sanitizeSupportText(body, 2000);
    if (!canSubmitSupportDraft(cleanSubject, cleanBody)) { setResult("Please add a clear subject and message of at least 12 characters."); return; }
    const draft: SupportTicketDraft = {
      operationId: makeOperationId("support"),
      topic,
      subject: cleanSubject,
      body: cleanBody,
      orderNumber: route.params?.orderNumber,
      contactPreference: "email",
    };
    const ticket = await accountStorage.createOrGetSupportTicket(draft);
    go(navigation, "SupportReceived", { caseId: ticket.caseId, topic: ticket.topic, orderNumber: ticket.orderNumber });
  }
  return (
    <Shell testID="H094" title="Support request" onBack={navigation.goBack}>
      <HidiText variant="title">Tell us what happened.</HidiText>
      <CapabilityNotice capability="supportTicketsApi" supportedCopy="Support ticket submission is available." />
      <HidiField label="Topic" value={topic} onChangeText={setTopic} />
      <HidiField label="Subject" value={subject} onChangeText={setSubject} />
      <HidiField label="Message" value={body} onChangeText={setBody} multiline numberOfLines={5} />
      {result ? <MessageCard tone="error">{result}</MessageCard> : null}
      <HidiButton label="Save support draft" onPress={() => void submit()} />
    </Shell>
  );
}

export function SupportConversationScreen({ navigation, route }: Props<"SupportConversation">) {
  const [ticketTopic, setTicketTopic] = useState("Support request");
  useEffect(() => { void accountStorage.supportTicket(route.params.caseId).then((ticket) => { if (ticket?.topic) setTicketTopic(ticket.topic); }); }, [route.params.caseId]);
  return (
    <Shell testID="H095" title="Support conversation" onBack={navigation.goBack}>
      <HidiText variant="title">{ticketTopic}</HidiText>
      <CapabilityNotice capability="supportTicketsApi" supportedCopy="Live support conversation is available." />
      <MessageCard>Reference {route.params.caseId} is saved locally. Conversation messages are not exposed by the current HIDI customer API.</MessageCard>
    </Shell>
  );
}

export function ContactHidiScreen({ navigation }: Props<"ContactHidi">) {
  return (
    <Shell testID="H096" title="Contact HIDI" onBack={navigation.goBack}>
      <HidiText variant="title">Reach HIDI.</HidiText>
      <MessageCard>Use email for launch support. Do not share OTPs, passwords or payment credentials.</MessageCard>
      <HidiButton label="Email support" onPress={() => void Linking.openURL("mailto:contact@hidiindia.com?subject=HIDI%20support")} />
      <HidiButton label="Open website" onPress={() => void Linking.openURL("https://thehidi.com/contact")} />
    </Shell>
  );
}

export function PoliciesLegalScreen({ navigation }: Props<"PoliciesLegal">) {
  return (
    <Shell testID="H097" title="Policies & legal" onBack={navigation.goBack}>
      <HidiText variant="title">Policies that matter.</HidiText>
      <Row title="Returns & exchanges" detail="Eligibility and inspection" onPress={() => void Linking.openURL("https://thehidi.com/returns")} />
      <Row title="Shipping" detail="Delivery timing and serviceability" onPress={() => void Linking.openURL("https://thehidi.com/shipping")} />
      <Row title="Privacy policy" detail="Data and consent" onPress={() => void Linking.openURL("https://thehidi.com/privacy")} />
    </Shell>
  );
}

export function PrivacyChoicesScreen({ navigation }: Props<"PrivacyChoices">) {
  const [pref, setPref] = useState<PrivacyPreference>(defaultPrivacyPreference);
  useEffect(() => { void accountStorage.privacyPreferences().then(setPref); }, []);
  async function save() { await accountStorage.savePrivacyPreferences(pref); go(navigation, "MyHidi"); }
  return (
    <Shell testID="H098" title="Privacy choices" onBack={navigation.goBack}>
      <HidiText variant="title">Control optional data.</HidiText>
      <ToggleRow title="Analytics" detail="Optional product analytics" value={pref.analytics} onValueChange={(v) => setPref((p) => ({ ...p, analytics: v }))} />
      <ToggleRow title="Personalization" detail="Use saved shopping signals" value={pref.personalization} onValueChange={(v) => setPref((p) => ({ ...p, personalization: v }))} />
      <ToggleRow title="Recently viewed history" detail="Local-device history" value={pref.recentHistory} onValueChange={(v) => setPref((p) => ({ ...p, recentHistory: v }))} />
      <ToggleRow title="Fit data" detail="Stored only when a supported fit helper is available" value={pref.fitData} onValueChange={(v) => setPref((p) => ({ ...p, fitData: v }))} />
      <Row title="Export data" detail="Server export capability" onPress={() => go(navigation, "ExportMyData")} />
      <Row title="Delete account" detail="Requires recent authentication" onPress={() => go(navigation, "DeleteAccount")} />
      <HidiButton label="Save privacy choices" onPress={() => void save()} />
    </Shell>
  );
}

export function ExportMyDataScreen({ navigation }: Props<"ExportMyData">) {
  return (
    <Shell testID="H099" title="Export data" onBack={navigation.goBack}>
      <HidiText variant="title">Data export.</HidiText>
      <CapabilityNotice capability="privacyExportApi" supportedCopy="Privacy export is available." />
      <MessageCard>The current HIDI API does not expose a customer privacy-export job. The app therefore does not claim that an export was submitted.</MessageCard>
    </Shell>
  );
}

export function DeleteAccountScreen({ navigation }: Props<"DeleteAccount">) {
  const [requestId, setRequestId] = useState("");
  async function recordLocalRequest() {
    const request = await accountStorage.requestDeletion();
    setRequestId(request.requestId);
  }
  return (
    <Shell testID="H100" title="Delete account" onBack={navigation.goBack}>
      <HidiText variant="title">Account deletion.</HidiText>
      <CapabilityNotice capability="privacyDeletionApi" supportedCopy="Privacy deletion is available." />
      <MessageCard>Deletion requires server-side identity verification, retention checks and order/legal safeguards. This build records a local request only.</MessageCard>
      {requestId ? <MessageCard tone="success">Local deletion request {requestId} recorded.</MessageCard> : null}
      <HidiButton label="Record local deletion request" onPress={() => void recordLocalRequest()} />
      {requestId ? <HidiButton label="Continue" onPress={() => replaceWith(navigation, "DeletionRequested", { requestId })} /> : null}
    </Shell>
  );
}

export function DeletionRequestedScreen({ navigation, route }: Props<"DeletionRequested">) {
  return (
    <Shell testID="H101" title="Deletion requested" onBack={navigation.goBack}>
      <HidiText variant="title">Deletion request saved locally.</HidiText>
      <MessageCard>Reference {route.params.requestId}. Server deletion is unavailable in the current customer API, so no account data has been deleted remotely.</MessageCard>
    </Shell>
  );
}

export function SignOutScreen({ navigation }: Props<"SignOutConfirm">) {
  const auth = useAuth();
  return (
    <Shell testID="H102" title="Sign out" onBack={navigation.goBack}>
      <HidiText variant="title">Sign out of this device?</HidiText>
      <MessageCard>Your local bag and guest browsing state remain available. Account session tokens are cleared.</MessageCard>
      <HidiButton label="Sign out" onPress={() => void auth.signOut().then(() => go(navigation, "MainTabs", { screen: "You" }))} />
    </Shell>
  );
}

export function ChangePhoneNumberScreen({ navigation }: Props<"ChangePhoneNumber">) {
  return (
    <Shell testID="H123" title="Phone number" onBack={navigation.goBack}>
      <HidiText variant="title">Change phone number.</HidiText>
      <CapabilityNotice capability="phoneChangeApi" supportedCopy="Phone change is available." />
      <MessageCard>The current customer identity contract does not expose secure phone replacement. Sign out and sign in with the new verified phone if needed.</MessageCard>
    </Shell>
  );
}

export function VerifyEmailAddressScreen({ navigation, route }: Props<"VerifyEmailAddress">) {
  return (
    <Shell testID="H124" title="Email verification" onBack={navigation.goBack}>
      <HidiText variant="title">Verify email.</HidiText>
      <CapabilityNotice capability="emailVerificationApi" supportedCopy="Email verification is available." />
      <MessageCard>{route.params?.email ? "Email on file: " + route.params.email : "Add an email from profile first."} The current mobile customer contract does not expose an email-verification challenge.</MessageCard>
    </Shell>
  );
}

export function FindGuestOrderScreen({ navigation }: Props<"FindGuestOrder">) {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  async function lookup() {
    const result = safeGuestOrderLookup(reference, contact);
    if (!result.accepted) { setMessage(result.message); return; }
    await accountStorage.saveGuestOrderLookup({ reference, contact, checkedAt: Date.now() });
    setMessage(result.message + " The current API does not expose scoped guest-order lookup yet.");
  }
  return (
    <Shell testID="H126" title="Find guest order" onBack={navigation.goBack}>
      <HidiText variant="title">Find a guest order.</HidiText>
      <CapabilityNotice capability="guestOrderAccessApi" supportedCopy="Guest-order lookup is available." />
      <HidiField label="Order reference" value={reference} onChangeText={setReference} />
      <HidiField label="Verified contact" value={contact} onChangeText={setContact} />
      {message ? <MessageCard>{message}</MessageCard> : null}
      <HidiButton label="Check access" onPress={() => void lookup()} />
    </Shell>
  );
}

export function SupportReceivedScreen({ navigation, route }: Props<"SupportReceived">) {
  return (
    <Shell testID="H132" title="Support received" onBack={navigation.goBack}>
      <HidiText variant="title">Support draft saved.</HidiText>
      <MessageCard>Reference {route.params.caseId} is saved locally. When the support-ticket API is connected, this can be submitted without losing your context.</MessageCard>
      <HidiButton label="View conversation" onPress={() => replaceWith(navigation, "SupportConversation", { caseId: route.params.caseId })} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  body: { padding: 20, gap: 14 },
  scrollBody: { padding: 20, paddingBottom: 40, gap: 14 },
  cardGroup: { gap: 2, marginTop: 6 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 28, alignItems: "center" },
  bold: { fontWeight: "600" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  inlineButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
});
