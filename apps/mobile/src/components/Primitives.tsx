import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ImageProps, Pressable, Text, TextInput, TextInputProps, View } from "react-native";
import { ChevronRight, Search } from "lucide-react-native";
import { colors } from "../theme";

export function PrimaryButton({ label, onPress, disabled, loading, className = "" }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; className?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress} className={`min-h-[52px] items-center justify-center rounded-xl px-5 ${disabled ? "bg-gray-300" : "bg-accent"} ${className}`}>
    {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-extrabold text-white">{label}</Text>}
  </Pressable>;
}
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} className="min-h-[48px] items-center justify-center rounded-xl border border-line bg-white px-5"><Text className="font-bold text-ink">{label}</Text></Pressable>;
}
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View className="gap-2"><Text className="text-sm font-bold text-ink">{label}</Text><TextInput {...props} accessibilityLabel={label} accessibilityHint={error} placeholderTextColor={colors.muted} className={`min-h-[52px] rounded-xl border bg-white px-4 text-base text-ink ${error ? "border-sale" : "border-line"}`} />{error ? <Text accessibilityRole="alert" className="text-sm text-sale">{error}</Text> : null}</View>;
}
export function CachedImage(props: ImageProps & { fallbackLabel?: string }) {
  const [failed, setFailed] = useState(false);
  const uri = typeof props.source === "object" && props.source && "uri" in props.source ? props.source.uri : undefined;
  useEffect(() => { setFailed(false); if (uri) void Image.prefetch(uri); }, [uri]);
  if (failed || !uri) return <View className="h-full w-full items-center justify-center bg-soft px-3"><Text className="text-center text-xs text-muted">{props.fallbackLabel ?? "Image unavailable"}</Text></View>;
  return <Image {...props} onError={(event) => { setFailed(true); props.onError?.(event); }} />;
}
export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View className="flex-row items-center justify-between px-4 py-3"><Text className="text-xl font-extrabold text-ink">{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} className="min-h-[44px] flex-row items-center justify-center"><Text className="font-bold text-accent">{action}</Text><ChevronRight size={18} color={colors.accent} /></Pressable> : null}</View>;
}
export function SearchPill({ onPress, placeholder = "Search kurtas, sets and more" }: { onPress: () => void; placeholder?: string }) {
  return <Pressable accessibilityRole="search" onPress={onPress} className="mx-4 min-h-[48px] flex-row items-center gap-3 rounded-xl border border-line bg-soft px-4"><Search size={19} color={colors.muted} /><Text className="flex-1 text-sm text-muted">{placeholder}</Text></Pressable>;
}
export function Skeleton({ className = "h-5 w-full" }: { className?: string }) { return <View className={`rounded-lg bg-gray-200 ${className}`} />; }
export function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <View className="flex-1 items-center justify-center px-8 py-20"><Text className="text-center text-2xl font-extrabold text-ink">{title}</Text><Text className="mt-3 text-center text-base leading-6 text-muted">{body}</Text><View className="mt-6 w-full"><PrimaryButton label={action} onPress={onAction} /></View></View>;
}
