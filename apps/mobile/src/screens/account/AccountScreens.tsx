import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bell, ChevronRight, HelpCircle, Mail, MapPin, ShieldCheck, UserRound } from "lucide-react-native";
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
import { canSubmitSupportDraft, makeOperationId, normalizeOptionalEmail, phase5Capabilities, safeGuestOrderLookup, sanitizeSupportText } from "../../models/account";
import type { NotificationPreference, PrivacyPreference } from "../../models/account";
import type { CheckoutAddress } from "../../models/checkout";
import { useHidiTheme } from "../../theme/HidiTheme";
import type { RootStackParamList } from "../../navigation/types";

type Props<Name extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, Name>;

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

export function AccountHomeScreen({ navigation }: Props<"MyHidi">) {
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

  if (!auth.session) return <GuestAccountScreen navigation={navigation as any} route={{ key: "GuestAccount", name: "GuestAccount" } as any} />;

  return (
    <ScrollView testID="H083" style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={styles.scrollBody}>
      <HidiText variant="metadata" style={{ color: colors.mutedText, letterSpacing: 1.2 }}>MY HIDI</HidiText>
      <HidiText variant="title">{name ? "Hello, " + name + "." : "Hello."}</HidiText>
      <HidiText variant="secondary" style={{ color: colors.mutedText }}>{auth.session.user.phone ? maskPhone(auth.session.user.phone) : "Signed in securely"}</HidiText>
      {summaryError ? <MessageCard tone="error">Account summary could not refresh. Sign-out and help remain available.</MessageCard> : null}
      <View style={styles.cardGroup}>
        <Row title="My orders" detail="View current and past orders" onPress={() => navigation.navigate("MyOrders")} icon={<UserRound size={18} color={colors.action} />} />
        <Row title="Saved items" detail={savedCount + " saved on this device"} onPress={() => navigation.navigate("MainTabs", { screen: "Saved" })} />
        <Row title="Addresses" detail="Manage delivery addresses" onPress={() => navigation.navigate("ManageAddresses")} icon={<MapPin size={18} color={colors.action} />} />
        <Row title="Shopping preferences" detail="Interests, sizes and history controls" onPress={() => navigation.navigate("ShoppingPreferences")} />
        <Row title="Notifications" detail="Inbox and channel settings" onPress={() => navigation.navigate("NotificationsInbox")} icon={<Bell size={18} color={colors.action} />} />
        <Row title="Help centre" detail="Orders, payment, delivery and support" onPress={() => navigation.navigate("HelpCentre")} icon={<HelpCircle size={18} color={colors.action} />} />
        <Row title="Privacy choices" detail="Consent, export and deletion" onPress={() => navigation.navigate("PrivacyChoices")} icon={<ShieldCheck size={18} color={colors.action} />} />
        <Row title="Sign out" detail="Clear local account data on this device" onPress={() => navigation.navigate("SignOutConfirm")} />
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
      <HidiButton label="Sign in / join HIDI" onPress={() => navigation.navigate("SignIn")} />
      <View style={styles.cardGroup}>
        <Row title="Find a guest order" detail="Use reference plus verified contact" onPress={() => navigation.navigate("FindGuestOrder")} />
        <Row title="Help centre" detail="Payment, delivery, returns and support" onPress={() => navigation.navigate("HelpCentre")} />
        <Row title="Policies & legal" detail="Shipping, returns, privacy and merchant details" onPress={() => navigation.navigate("PoliciesLegal")} />
        <Row title="Contact HIDI" detail="Use the supported async route" onPress={() => navigation.navigate("ContactHidi")} />
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
      navigation.navigate("MyHidi");
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
      <Row title="Change phone number" detail="Requires secure re-verification" onPress={() => navigation.navigate("ChangePhoneNumber")} />
      <Row title="Verify email address" detail="Optional receipts and account messages" onPress={() => navigation.navigate("VerifyEmailAddress", { email })} />
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
          <HidiText variant="secondary" style={styles.bold}>{item.firstName}{item.lastName ? " " + item.lastName : ""}{item.isDefault ? " · Default" : ""}</HidiText>
          <HidiText variant="metadata">{item.line1}, {item.city}, {item.state} {item.postalCode}</HidiText>
          <View style={styles.inlineActions}>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate("AddAddress")} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.action }}>Edit</HidiText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void makeDefault(item.id)} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.action }}>Make default</HidiText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void remove(item.id)} style={styles.inlineButton}><HidiText variant="metadata" style={{ color: colors.error }}>Delete</HidiText></Pressable>
          </View>
        </View>
      )) : <MessageCard>No saved addresses yet. Add one when you checkout or create it now.</MessageCard>}
      <HidiButton label="Add address" onPress={() => navigation.navigate("AddAddress")} />
    </Shell>
  );
}

export function SavedPaymentMethodsScreen({ navigation }: Props<"SavedPaymentMethods">) {
  return (
    <Shell testID="H087" title="Saved payment methods" onBack={navigation.goBack}>
      <HidiText variant="title">Secure payment methods.</HidiText>
      <CapabilityNotice capability="paymentMethodTokens" supportedCopy="Provider-tokenized methods are available." />
      <MessageCard>No saved payment methods are returned by the current HIDI API. You can still choose a fresh provider-owned payment method at checkout.</MessageCard>
      <HidiButton label="Back to My HIDI" onPress={() => navigation.navigate("MyHidi")} />
    </Shell>
  );
}

export function ShoppingPreferencesScreen({ navigation }: Props<"ShoppingPreferences">) {
  const [interests, setInterests] = useState<string[]>([]);
  const [recent, setRecent] = useState(true);
  const [searches, setSearches] = useState(true);
  const [saved, setSaved] = useState(false);
  const options = ["Everyday ease", "Work edit", "Indian wear", "Occasion dressing", "Accessories"];
  useEffect(() => { void Promise.all([localStore.stylePreferences(), localStore.recentTrackingEnabled(), localStore.searchTrackingEnabled()]).then(([a,b,c]) => { setInterests(a); setRecent(b); setSearches(c); }); }, []);
  async function save() { await localStore.saveStylePreferences(interests); await localStore.setRecentTrackingEnabled(recent); await localStore.setSearchTrackingEnabled(searches); setSaved(true); }
  return (
    <Shell testID="H088" title="Shopping preferences" onBack={navigation.goBack}>
      <HidiText variant="title">Make HIDI feel familiar.</HidiText>
      <MessageCard>Preferences improve suggestions only. They never hide the catalogue or force measurements.</MessageCard>
      {options.map((option) => <ToggleRow key={option} title={option} detail="Optional interest" value={interests.includes(option)} onValueChange={(value) => setInterests((cur) => value ? Array.from(new Set([...cur, option])) : cur.filter((item) => item !== option))} />)}
      <ToggleRow title="Remember recently viewed" detail="Stored on this device" value={recent} onValueChange={setRecent} />
      <ToggleRow title="Remember recent searches" detail="Stored on this device" value={searches} onValueChange={setSearches} />
      {saved ? <MessageCard tone="success">Preferences saved on this device.</MessageCard> : null}
      <HidiButton label="Save preferences" onPress={() => void save()} />
    </Shell>
  );
}

export function NotificationsInboxScreen({ navigation }: Props<"NotificationsInbox">) {
  const { colors } = useHidiTheme();
  const notifications: Array<{ id: string; title: string; orderNumber?: string; timestamp: string }> = [];
  if (!notifications.length) {
    return (
      <Shell testID="H090" title="Notifications" onBack={navigation.goBack}>
        <HidiText variant="title">Nothing new here.</HidiText>
        <HidiText variant="secondary" style={{ color: colors.mutedText }}>Order updates and requested alerts appear here when the notification API is available. OS permission off is not treated as an empty inbox.</HidiText>
        <Row title="Notification settings" detail="Choose order and promotional channels" onPress={() => navigation.navigate("NotificationSettings")} />
        <HidiButton label="Explore HIDI" onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} />
      </Shell>
    );
  }
  return <Shell testID="H089" title="Notifications" onBack={navigation.goBack}><HidiText>Notifications loaded.</HidiText></Shell>;
}

export function NotificationSettingsScreen({ navigation }: Props<"NotificationSettings">) {
  const [prefs, setPrefs] = useState<NotificationPreference>(defaultNotificationPreference);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void accountStorage.notificationPreferences().then(setPrefs); }, []);
  async function save() { await accountStorage.saveNotificationPreferences(prefs); setSaved(true); }
  return (
    <Shell testID="H091" title="Notification settings" onBack={navigation.goBack}>
      <HidiText variant="title">Notification choices.</HidiText>
      <CapabilityNotice capability="notificationsApi" supportedCopy="Notification preferences are server-synced." />
      <ToggleRow title="Order updates by SMS" detail="Transactional notices according to policy" value={prefs.orderSms} onValueChange={(v) => setPrefs({ ...prefs, orderSms: v })} />
      <ToggleRow title="Order updates by WhatsApp" detail="Only when the approved sender is configured" value={prefs.orderWhatsApp} onValueChange={(v) => setPrefs({ ...prefs, orderWhatsApp: v })} />
      <ToggleRow title="Promotional messages" detail="Optional campaigns only" value={prefs.promotional} onValueChange={(v) => setPrefs({ ...prefs, promotional: v })} />
      <Row title="Device notification permission" detail="Open OS-owned settings; HIDI does not clone the system prompt" onPress={() => navigation.navigate("AndroidPermissionDialog")} />
      {saved ? <MessageCard tone="success">Local notification choices saved.</MessageCard> : null}
      <HidiButton label="Save settings" onPress={() => void save()} />
    </Shell>
  );
}

export function HelpCentreScreen({ navigation }: Props<"HelpCentre">) {
  return (
    <Shell testID="H092" title="Help centre" onBack={navigation.goBack}>
      <HidiText variant="title">How can we help?</HidiText>
      <CapabilityNotice capability="helpTopicsApi" supportedCopy="Help topics loaded from HIDI." />
      <Row title="Help with an order" detail="Delivery, payment, refunds or products" onPress={() => navigation.navigate("HelpWithOrder")} />
      <Row title="Create support request" detail="Send a structured request" onPress={() => navigation.navigate("CreateSupportRequest")} />
      <Row title="Contact HIDI" detail="Configured channels only" onPress={() => navigation.navigate("ContactHidi")} />
      <Row title="Policies & legal" detail="Shipping, returns, privacy and terms" onPress={() => navigation.navigate("PoliciesLegal")} />
    </Shell>
  );
}

export function HelpWithOrderScreen({ navigation, route }: Props<"HelpWithOrder">) {
  const orderNumber = route.params?.orderNumber;
  return (
    <Shell testID="H093" title="Help with an order" onBack={navigation.goBack}>
      <HidiText variant="title">Tell us what happened.</HidiText>
      <HidiText variant="secondary">{orderNumber ? "Order " + orderNumber : "Choose a common issue. If you know the order, include it in your request."}</HidiText>
      {["Delivery", "Payment", "Refund", "Product issue"].map((topic) => (
        <Row key={topic} title={topic} detail="Carry this context into support" onPress={() => navigation.navigate("CreateSupportRequest", { orderNumber, topic })} />
      ))}
    </Shell>
  );
}

export function CreateSupportRequestScreen({ navigation, route }: Props<"CreateSupportRequest">) {
  const [topic, setTopic] = useState(route.params?.topic ?? "General support");
  const [subject, setSubject] = useState(route.params?.orderNumber ? "Help with order " + route.params.orderNumber : "");
  const [body, setBody] = useState("");
  const [contactPreference, setContactPreference] = useState<"phone" | "email" | "whatsapp">("email");
  const [error, setError] = useState("");
  async function submit() {
    const cleanSubject = sanitizeSupportText(subject, 120);
    const cleanBody = sanitizeSupportText(body, 2000);
    if (!canSubmitSupportDraft(cleanSubject, cleanBody)) { setError("Add a subject and at least 12 characters describing the issue."); return; }
    const ticket = await accountStorage.createOrGetSupportTicket({ operationId: makeOperationId("support"), orderNumber: route.params?.orderNumber, topic, subject: cleanSubject, body: cleanBody, contactPreference });
    navigation.replace("SupportReceived", { caseId: ticket.caseId, topic: ticket.topic, orderNumber: ticket.orderNumber });
  }
  return (
    <Shell testID="H094" title="Create support request" onBack={navigation.goBack}>
      <HidiText variant="title">Create a support request.</HidiText>
      <CapabilityNotice capability="supportTicketsApi" supportedCopy="Support tickets are submitted to HIDI." />
      <HidiField label="Topic" value={topic} onChangeText={setTopic} />
      <HidiField label="Subject" value={subject} onChangeText={setSubject} />
      <HidiField label="Problem details" value={body} onChangeText={setBody} multiline />
      <View style={styles.inlineActions}>{["email", "phone", "whatsapp"].map((item) => <Pressable key={item} onPress={() => setContactPreference(item as any)} style={styles.inlineButton}><HidiText variant="metadata">{contactPreference === item ? "✓ " : ""}{item}</HidiText></Pressable>)}</View>
      {error ? <MessageCard tone="error">{error}</MessageCard> : null}
      <HidiButton label="Send request" onPress={() => void submit()} />
    </Shell>
  );
}

export function SupportConversationScreen({ navigation, route }: Props<"SupportConversation">) {
  const [ticket, setTicket] = useState<any>(null);
  useEffect(() => { void accountStorage.supportTicket(route.params.caseId).then(setTicket); }, [route.params.caseId]);
  return (
    <Shell testID="H095" title="Support conversation" onBack={navigation.goBack}>
      <HidiText variant="title">{ticket?.caseId ?? route.params.caseId}</HidiText>
      <MessageCard>{ticket ? "Case updates will appear here after server support messaging is available. This local request is not marked sent until acknowledged by HIDI." : "This case is not in the local support cache."}</MessageCard>
      {ticket ? <HidiText variant="secondary">{ticket.subject}</HidiText> : null}
      <HidiButton label="Back to help" onPress={() => navigation.navigate("HelpCentre")} />
    </Shell>
  );
}

export function ContactHidiScreen({ navigation }: Props<"ContactHidi">) {
  return (
    <Shell testID="H096" title="Contact HIDI" onBack={navigation.goBack}>
      <HidiText variant="title">Contact HIDI.</HidiText>
      <MessageCard>No live chat or phone support is exposed by the current HIDI support-channel API. Use the asynchronous request route so no invented contact is shown.</MessageCard>
      <HidiButton label="Open support request" onPress={() => navigation.navigate("CreateSupportRequest")} />
      <Pressable accessibilityRole="link" style={styles.centerAction} onPress={() => void Linking.openURL("https://thehidi.com/contact")}><HidiText variant="secondary">Open website contact page</HidiText></Pressable>
    </Shell>
  );
}

export function PoliciesLegalScreen({ navigation }: Props<"PoliciesLegal">) {
  const policies = [
    ["Shipping policy", "https://thehidi.com/shipping"],
    ["Return policy", "https://thehidi.com/returns"],
    ["Privacy policy", "https://thehidi.com/privacy"],
    ["Terms", "https://thehidi.com/terms"],
  ];
  return (
    <Shell testID="H097" title="Policies & legal" onBack={navigation.goBack}>
      <HidiText variant="title">Policies & legal.</HidiText>
      <MessageCard>Policy bodies are opened from the published web policy pages. Checkout must retain the exact policy snapshot separately when the backend exposes it.</MessageCard>
      {policies.map(([title, url]) => <Row key={title} title={title} detail="Open published policy" onPress={() => void Linking.openURL(url)} />)}
    </Shell>
  );
}

export function PrivacyChoicesScreen({ navigation }: Props<"PrivacyChoices">) {
  const [prefs, setPrefs] = useState<PrivacyPreference>(defaultPrivacyPreference);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void accountStorage.privacyPreferences().then(setPrefs); }, []);
  async function save() { await accountStorage.savePrivacyPreferences(prefs); setSaved(true); }
  return (
    <Shell testID="H098" title="Privacy choices" onBack={navigation.goBack}>
      <HidiText variant="title">Your data choices.</HidiText>
      <MessageCard>Required order processing stays on. Optional analytics, personalization, history and fit data controls are separate.</MessageCard>
      <ToggleRow title="Analytics" detail="Optional event upload" value={prefs.analytics} onValueChange={(v) => setPrefs({ ...prefs, analytics: v })} />
      <ToggleRow title="Personalization" detail="Suggestions and preference use" value={prefs.personalization} onValueChange={(v) => setPrefs({ ...prefs, personalization: v })} />
      <ToggleRow title="Recent history" detail="Recently viewed and searches" value={prefs.recentHistory} onValueChange={(v) => setPrefs({ ...prefs, recentHistory: v })} />
      <ToggleRow title="Fit data" detail="No body measurements are saved unless a future fit service is approved" value={prefs.fitData} onValueChange={(v) => setPrefs({ ...prefs, fitData: v })} />
      <Row title="Export my data" detail="Requires authenticated server export" onPress={() => navigation.navigate("ExportMyData")} />
      <Row title="Delete account" detail="Secure deletion request" onPress={() => navigation.navigate("DeleteAccount")} />
      {saved ? <MessageCard tone="success">Privacy choices saved locally.</MessageCard> : null}
      <HidiButton label="Save privacy choices" onPress={() => void save()} />
    </Shell>
  );
}

export function ExportMyDataScreen({ navigation }: Props<"ExportMyData">) {
  const [request, setRequest] = useState<string | null>(null);
  async function submit() { const result = await accountStorage.requestDataExport(); setRequest(result.requestId); }
  return (
    <Shell testID="H099" title="Export my data" onBack={navigation.goBack}>
      <HidiText variant="title">Request your data.</HidiText>
      <CapabilityNotice capability="privacyExportApi" supportedCopy="Secure export request is available." />
      <MessageCard>A real export must be created by the authenticated privacy API and delivered through a short-lived secure link, not by push notification.</MessageCard>
      {request ? <MessageCard tone="success">Local request reference {request} recorded for follow-up. No export file was created by the app.</MessageCard> : null}
      <HidiButton label="Request data export" onPress={() => void submit()} />
    </Shell>
  );
}

export function DeleteAccountScreen({ navigation }: Props<"DeleteAccount">) {
  const [confirm, setConfirm] = useState(false);
  async function submit() { const result = await accountStorage.requestDeletion(); navigation.replace("DeletionRequested", { requestId: result.requestId }); }
  return (
    <Shell testID="H100" title="Delete account" onBack={navigation.goBack}>
      <HidiText variant="title">Account deletion.</HidiText>
      <CapabilityNotice capability="privacyDeletionApi" supportedCopy="Deletion request can be submitted securely." />
      <MessageCard>Deletion requires server-side identity verification and retained-record explanation. Open orders and finance records cannot vanish immediately.</MessageCard>
      <ToggleRow title="I understand retained records may remain" detail="Required before creating a local request record" value={confirm} onValueChange={setConfirm} />
      <HidiButton label="Request deletion" disabled={!confirm} onPress={() => void submit()} />
    </Shell>
  );
}

export function DeletionRequestedScreen({ navigation, route }: Props<"DeletionRequested">) {
  return (
    <Shell testID="H101" title="Deletion requested" onBack={navigation.goBack}>
      <HidiText variant="title">Request recorded.</HidiText>
      <MessageCard>Reference {route.params.requestId}. The current app recorded this locally because the deletion API is unavailable. Server account status and processor tasks are not changed by this local record.</MessageCard>
      <HidiButton label="Finish" onPress={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs", params: { screen: "You" } }] })} />
    </Shell>
  );
}

export function SignOutScreen({ navigation }: Props<"SignOutConfirm">) {
  const auth = useAuth();
  async function signOut() { await accountStorage.clearSensitiveLocalAccountData(); await auth.signOut(); navigation.reset({ index: 0, routes: [{ name: "MainTabs", params: { screen: "You" } }] }); }
  return (
    <Shell testID="H102" title="Sign out" onBack={navigation.goBack}>
      <HidiText variant="title">Sign out of this device?</HidiText>
      <MessageCard>Local account cache, support drafts and private account data will be cleared. Orders remain linked to the account and the bag is not silently transferred to another user.</MessageCard>
      <HidiButton label="Sign out" onPress={() => void signOut()} />
    </Shell>
  );
}

export function ChangePhoneNumberScreen({ navigation }: Props<"ChangePhoneNumber">) {
  return (
    <Shell testID="H123" title="Change phone number" onBack={navigation.goBack}>
      <HidiText variant="title">Secure phone change.</HidiText>
      <CapabilityNotice capability="phoneChangeApi" supportedCopy="Phone change challenge is available." />
      <MessageCard>Changing a verified phone number requires reauthentication, a server challenge and collision checks. The current app will not merge accounts by a typed number.</MessageCard>
      <HidiButton label="Reauthenticate" onPress={() => navigation.navigate("SignIn")} />
    </Shell>
  );
}

export function VerifyEmailAddressScreen({ navigation, route }: Props<"VerifyEmailAddress">) {
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [message, setMessage] = useState("");
  function send() { try { normalizeOptionalEmail(email); setMessage("Email verification endpoint is unavailable. No link was sent."); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Invalid email."); } }
  return (
    <Shell testID="H124" title="Verify email" onBack={navigation.goBack}>
      <HidiText variant="title">Verify email address.</HidiText>
      <CapabilityNotice capability="emailVerificationApi" supportedCopy="Verification link can be sent." />
      <HidiField label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      {message ? <MessageCard>{message}</MessageCard> : null}
      <HidiButton label="Send verification link" onPress={send} />
    </Shell>
  );
}

export function AndroidPermissionDialogScreen({ navigation }: Props<"AndroidPermissionDialog">) {
  return (
    <Shell testID="H125" title="Notification permission" onBack={navigation.goBack}>
      <HidiText variant="title">Device permission is OS-owned.</HidiText>
      <MessageCard>HIDI does not clone the Android system prompt. You can open device settings, and the app handles allow, denial or backgrounding without blocking account access.</MessageCard>
      <HidiButton label="Open device settings" onPress={() => void Linking.openSettings()} />
    </Shell>
  );
}

export function FindGuestOrderScreen({ navigation }: Props<"FindGuestOrder">) {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  async function find() { const result = safeGuestOrderLookup(reference, contact); setMessage(result.message); if (result.accepted) await accountStorage.saveGuestOrderLookup({ reference, contact, checkedAt: Date.now() }); }
  return (
    <Shell testID="H126" title="Find a guest order" onBack={navigation.goBack}>
      <HidiText variant="title">Find a guest order.</HidiText>
      <CapabilityNotice capability="guestOrderAccessApi" supportedCopy="Guest order access challenge is available." />
      <HidiField label="Order reference" value={reference} onChangeText={setReference} autoCapitalize="characters" />
      <HidiField label="Verified contact" value={contact} onChangeText={setContact} keyboardType="email-address" />
      {message ? <MessageCard>{message}</MessageCard> : null}
      <HidiButton label="Verify & find order" onPress={() => void find()} />
    </Shell>
  );
}

export function SupportReceivedScreen({ navigation, route }: Props<"SupportReceived">) {
  return (
    <Shell testID="H132" title="Support request received" onBack={navigation.goBack}>
      <HidiText variant="title">Support reference {route.params.caseId}</HidiText>
      <MessageCard>Topic: {route.params.topic}. If this is a local draft, it is not a server-submitted case until the support ticket API acknowledges it. Retrying with the same operation returns the same local reference.</MessageCard>
      <HidiButton label="View request" onPress={() => navigation.navigate("SupportConversation", { caseId: route.params.caseId })} />
      <Pressable accessibilityRole="button" style={styles.centerAction} onPress={() => navigation.navigate("HelpCentre")}><HidiText variant="secondary">Back to help</HidiText></Pressable>
    </Shell>
  );
}

const styles = StyleSheet.create({
  zero: { paddingHorizontal: 0, paddingTop: 0 },
  scrollBody: { padding: 20, paddingBottom: 36, gap: 12 },
  body: { padding: 20, gap: 14 },
  cardGroup: { marginTop: 12 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  rowIcon: { width: 28, alignItems: "center" },
  bold: { fontWeight: "600" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  inlineButton: { minHeight: 44, justifyContent: "center", paddingRight: 10 },
  centerAction: { minHeight: 48, alignItems: "center", justifyContent: "center" },
});
