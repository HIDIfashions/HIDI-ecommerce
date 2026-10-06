import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Bell, Heart, Search } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { Product } from "../domain";
import { brandAssets } from "../config";
import { useCommerce } from "../store";
import { colors } from "../theme";
import { CachedImage, EmptyState, SearchPill, SectionHeading, Skeleton } from "../components/Primitives";
import { ProductCard } from "../components/ProductCard";

const stories = [
  { label: "New In", image: brandAssets.portrait, collectionSlug: "new-arrivals" },
  { label: "Work Edit", image: brandAssets.hero, collectionSlug: "work-edit" },
  { label: "Occasion", image: brandAssets.occasion, collectionSlug: "occasion" },
  { label: "HIDI Studio", image: brandAssets.cinematic, collectionSlug: "all" },
  { label: "Insider", image: brandAssets.banner, insider: true },
];
const heroes = [
  { image: brandAssets.hero, title: "THE NEW HIDI", subtitle: "Everyday Indian wear, elevated.", collectionSlug: "new-arrivals" },
  { image: brandAssets.cinematic, title: "MOVE IN COLOUR", subtitle: "Fluid silhouettes for modern days.", collectionSlug: "all" },
  { image: brandAssets.occasion, title: "OCCASION EDIT", subtitle: "Statement pieces with quiet confidence.", collectionSlug: "occasion" },
];

function CampaignClock() {
  const { campaign } = useCommerce(); const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!campaign) return null;
  const remaining = Math.max(0, Date.parse(campaign.endsAt) - now); const hours = Math.floor(remaining / 3600000); const minutes = Math.floor((remaining % 3600000) / 60000); const seconds = Math.floor((remaining % 60000) / 1000);
  return <View className="mx-4 mt-4 flex-row items-center justify-between rounded-xl bg-ink px-4 py-3"><View className="flex-1"><Text className="font-extrabold text-white">{campaign.title}</Text><Text className="mt-0.5 text-xs text-gray-300">{campaign.subtitle ?? "Limited campaign"}</Text></View><Text className="font-black tabular-nums text-white">{hours.toString().padStart(2, "0")}:{minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}</Text></View>;
}

function HomeHeader() {
  const navigation = useNavigation<any>(); const { width } = useWindowDimensions();
  return <View className="bg-white pb-4">
    <View className="min-h-16 flex-row items-center justify-between px-4"><View><Text className="text-3xl font-black tracking-[5px] text-ink">HIDI</Text><Text className="text-[10px] font-bold tracking-[2px] text-muted">FASHION, BEAUTIFULLY YOURS</Text></View><View className="flex-row"><Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => navigation.navigate("Search")} className="h-12 w-12 items-center justify-center"><Search size={22} color={colors.ink} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Wishlist" onPress={() => navigation.navigate("Wishlist")} className="h-12 w-12 items-center justify-center"><Heart size={22} color={colors.ink} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Notifications" className="h-12 w-12 items-center justify-center"><Bell size={22} color={colors.ink} /></Pressable></View></View>
    <SearchPill onPress={() => navigation.navigate("Search")} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 18, gap: 14 }}>
      {stories.map(story => <Pressable key={story.label} accessibilityRole="button" onPress={() => story.insider ? navigation.navigate("Insider") : navigation.navigate("Catalog", { title: story.label, collectionSlug: story.collectionSlug })} className="w-[74px] items-center"><View className="h-[66px] w-[66px] rounded-full border-2 border-accent p-[3px]"><View className="h-full w-full overflow-hidden rounded-full bg-soft"><CachedImage source={{ uri: story.image }} className="h-full w-full" resizeMode="cover" /></View></View><Text numberOfLines={1} className="mt-2 text-center text-xs font-bold text-ink">{story.label}</Text></Pressable>)}
    </ScrollView>
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} className="mt-5">
      {heroes.map(hero => <Pressable key={hero.title} accessibilityRole="button" onPress={() => navigation.navigate("Catalog", { title: hero.title, collectionSlug: hero.collectionSlug })} style={{ width }} className="px-4"><View className="relative aspect-[16/10] overflow-hidden rounded-card bg-soft"><CachedImage source={{ uri: hero.image }} className="h-full w-full" resizeMode="cover" /><View className="absolute inset-0 justify-end bg-black/25 p-5"><Text className="text-2xl font-black text-white">{hero.title}</Text><Text className="mt-1 text-sm font-semibold text-white">{hero.subtitle}</Text><View className="mt-4 self-start rounded-lg bg-white px-4 py-2"><Text className="font-extrabold text-ink">SHOP NOW</Text></View></View></View></Pressable>)}
    </ScrollView>
    <CampaignClock />
    <SectionHeading title="Curated for you" action="View all" onAction={() => navigation.navigate("Catalog", { title: "All styles" })} />
  </View>;
}

export default function HomeScreen() {
  const navigation = useNavigation<any>(); const { products, catalogState, catalogError, refreshCatalog, wishlist, toggleWishlist } = useCommerce();
  const feed = useMemo(() => products, [products]);
  if (catalogState === "loading" && !feed.length) return <View className="flex-1 bg-white px-4 pt-12"><Skeleton className="h-12 w-40" /><Skeleton className="mt-6 h-12 w-full" /><Skeleton className="mt-5 aspect-[16/10] w-full" /><View className="mt-6 flex-row gap-3"><Skeleton className="aspect-[4/5] flex-1" /><Skeleton className="aspect-[4/5] flex-1" /></View></View>;
  if (catalogState === "error" && !feed.length) return <EmptyState title="The edit could not load." body={catalogError} action="Try again" onAction={() => void refreshCatalog()} />;
  return <FlashList<Product> data={feed} numColumns={2} renderItem={({ item }) => <ProductCard product={item} saved={wishlist.includes(item.slug)} onToggleSaved={() => void toggleWishlist(item.slug)} onOpen={() => navigation.navigate("Product", { slug: item.slug })} />} ListHeaderComponent={<HomeHeader />} onEndReachedThreshold={0.6} contentContainerStyle={{ paddingBottom: 24, backgroundColor: "#fff" }} keyExtractor={item => item.id} />;
}
