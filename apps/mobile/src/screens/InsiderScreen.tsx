import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Crown, Gift, ShieldCheck, Sparkles, Truck } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { BrandHeader } from "../components/Chrome";
import { PrimaryButton } from "../components/Primitives";
import { commerceApi } from "../api";
import type { InsiderSummary } from "../domain";
import { useCommerce } from "../store";
import { colors } from "../theme";

const benefits = [
  { icon: Sparkles, title: "Early access", copy: "Get first access only when an approved HIDI campaign marks your tier eligible." },
  { icon: Truck, title: "Member shipping", copy: "Shipping benefits are applied only from canonical checkout rules, never a client-side promise." },
  { icon: Gift, title: "Points & rewards", copy: "Earned and redeemable points come from the HIDI rewards ledger." },
  { icon: ShieldCheck, title: "Premium badge", copy: "Limited-edition badges are driven by product and membership eligibility from the server." },
];
export default function InsiderScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Insider">) {
  const { auth } = useCommerce(); const [summary, setSummary] = useState<InsiderSummary | null>(null);
  useEffect(() => { if (auth) void commerceApi.insider(auth.access_token).then(setSummary).catch(() => undefined); }, [auth?.access_token]);
  return <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 40 }}><BrandHeader navigation={navigation} title="INSIDER" /><View className="bg-ink px-5 pb-8 pt-8"><View className="h-16 w-16 items-center justify-center rounded-full bg-accent"><Crown size={31} color="white" /></View><Text className="mt-5 text-3xl font-black text-white">HIDI Insider</Text><Text className="mt-2 text-base leading-6 text-gray-300">A premium club for early access, considered rewards and member-only fashion moments.</Text><View className="mt-6 flex-row gap-3"><View className="flex-1 rounded-xl bg-white/10 p-4"><Text className="text-xs font-bold text-gray-300">CURRENT TIER</Text><Text className="mt-1 text-xl font-black text-white">{summary?.tier ?? (auth ? "MEMBER" : "GUEST")}</Text></View><View className="flex-1 rounded-xl bg-white/10 p-4"><Text className="text-xs font-bold text-gray-300">POINTS</Text><Text className="mt-1 text-xl font-black text-white">{summary?.points ?? 0}</Text></View></View></View>
    <View className="px-5 pt-5">{benefits.map(({ icon: Icon, title, copy }) => <View key={title} className="flex-row gap-4 border-b border-line py-5"><View className="h-12 w-12 items-center justify-center rounded-full bg-pink-50"><Icon size={22} color={colors.accent} /></View><View className="flex-1"><Text className="text-base font-black text-ink">{title}</Text><Text className="mt-1 text-sm leading-5 text-muted">{copy}</Text></View></View>)}<View className="mt-7">{auth ? <PrimaryButton label="REFRESH MEMBERSHIP" onPress={() => void commerceApi.insider(auth.access_token).then(setSummary)} /> : <PrimaryButton label="SIGN IN TO CHECK ELIGIBILITY" onPress={() => navigation.navigate("Login", { returnTo: "Profile" })} />}</View><Pressable onPress={() => navigation.navigate("Catalog", { title: "Insider edit" })} className="mt-4 min-h-12 items-center justify-center"><Text className="font-extrabold text-accent">EXPLORE CURRENT HIDI STYLES</Text></Pressable></View>
  </ScrollView>;
}
