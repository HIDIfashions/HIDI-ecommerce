import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { brandAssets } from "../config";
import { CachedImage, SearchPill } from "../components/Primitives";

const editorials = [
  { title: "THE ART OF THE DUPATTA", copy: "Movement, colour and effortless layering.", image: brandAssets.cinematic, collection: "all" },
  { title: "WORK, REFINED", copy: "Polished silhouettes made for long days.", image: brandAssets.hero, collection: "work-edit" },
  { title: "AFTER-DARK OCCASION", copy: "Rich tones and considered detail.", image: brandAssets.occasion, collection: "occasion" },
  { title: "HIDI MUSE", copy: "A cinematic edit of the season's signatures.", image: brandAssets.banner, collection: "new-arrivals" },
];
export default function TrendsScreen() {
  const navigation = useNavigation<any>();
  return <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 32 }}><View className="px-4 pb-4 pt-5"><Text className="text-3xl font-black text-ink">Studio</Text><Text className="mt-1 text-sm text-muted">Stories, styling and what to wear next.</Text></View><SearchPill onPress={() => navigation.navigate("Search")} placeholder="Search the HIDI edit" />
    <View className="mt-5 gap-5 px-4">{editorials.map((story, index) => <Pressable key={story.title} accessibilityRole="button" onPress={() => navigation.navigate("Catalog", { title: story.title, collectionSlug: story.collection })} className="overflow-hidden rounded-card bg-white shadow-boutique"><View className={`${index % 2 ? "aspect-square" : "aspect-[4/5]"} overflow-hidden bg-soft`}><CachedImage source={{ uri: story.image }} className="h-full w-full" resizeMode="cover" /></View><View className="p-5"><Text className="text-xl font-black tracking-wide text-ink">{story.title}</Text><Text className="mt-2 text-sm leading-6 text-muted">{story.copy}</Text><Text className="mt-4 text-sm font-extrabold text-accent">EXPLORE THE EDIT →</Text></View></Pressable>)}</View>
  </ScrollView>;
}
