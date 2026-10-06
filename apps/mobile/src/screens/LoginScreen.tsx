import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { authConfigured, sendOtp, verifyOtp } from "../api";
import { BrandHeader } from "../components/Chrome";
import { Field, PrimaryButton } from "../components/Primitives";
import { useCommerce } from "../store";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;
export default function LoginScreen({ navigation, route }: Props) {
  const store = useCommerce(); const [phone, setPhone] = useState(""); const [normalized, setNormalized] = useState(""); const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function send() { setBusy(true); setError(""); try { setNormalized(await sendOtp(phone)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send code."); } finally { setBusy(false); } }
  async function verify() { setBusy(true); setError(""); try { await store.setAuth(await verifyOtp(normalized, code)); const target = route.params?.returnTo; navigation.reset({ index: 0, routes: [{ name: "MainTabs", params: { screen: target ?? "Profile" } }] }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify code."); } finally { setBusy(false); } }
  return <View className="flex-1 bg-white"><BrandHeader navigation={navigation} title="SIGN IN" /><View className="px-5 pt-8"><Text className="text-3xl font-black text-ink">Your HIDI, everywhere.</Text><Text className="mt-3 text-base leading-6 text-muted">Use your mobile number to access orders and membership. Browsing never requires sign-in.</Text><View className="mt-8 gap-5">{!normalized ? <><Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit Indian mobile" error={error} /><PrimaryButton label="SEND WHATSAPP CODE" loading={busy} disabled={!authConfigured()} onPress={() => void send()} />{!authConfigured() ? <Text className="text-sm leading-5 text-sale">Customer verification keys are not configured in this build. Guest shopping remains available.</Text> : null}</> : <><Text className="font-bold text-ink">Code sent to {normalized}</Text><Field label="6-digit verification code" value={code} onChangeText={v => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" error={error} /><PrimaryButton label="VERIFY & CONTINUE" loading={busy} disabled={code.length !== 6} onPress={() => void verify()} /><Pressable onPress={() => { setNormalized(""); setCode(""); }} className="min-h-12 items-center justify-center"><Text className="font-bold text-accent">CHANGE NUMBER</Text></Pressable></>}</View><Pressable onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} className="mt-8 min-h-12 items-center justify-center"><Text className="font-bold text-ink">Continue as guest</Text></Pressable></View></View>;
}
