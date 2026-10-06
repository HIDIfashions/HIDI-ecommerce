import React from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowLeft, Heart, Search, ShoppingBag } from "lucide-react-native";
import { colors } from "../theme";

export function BrandHeader({ navigation, title }: { navigation: any; title?: string }) {
  return <View className="min-h-14 flex-row items-center justify-between bg-white px-4">
    <View className="flex-row items-center gap-2">{navigation.canGoBack?.() ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={navigation.goBack} className="h-12 w-12 items-center justify-center"><ArrowLeft size={22} color={colors.ink} /></Pressable> : null}<Text className="text-2xl font-black tracking-[4px] text-ink">{title ?? "HIDI"}</Text></View>
    <View className="flex-row"><Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => navigation.navigate("Search")} className="h-12 w-12 items-center justify-center"><Search size={21} color={colors.ink} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Wishlist" onPress={() => navigation.navigate("Wishlist")} className="h-12 w-12 items-center justify-center"><Heart size={21} color={colors.ink} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Bag" onPress={() => navigation.navigate("MainTabs", { screen: "Bag" })} className="h-12 w-12 items-center justify-center"><ShoppingBag size={21} color={colors.ink} /></Pressable></View>
  </View>;
}
