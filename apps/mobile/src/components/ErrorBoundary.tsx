import React from "react";
import { Pressable, Text, View } from "react-native";

type Props = { children?: React.ReactNode };
type State = { error: Error | null };
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <View className="flex-1 items-center justify-center bg-white px-8">
      <Text className="text-center text-2xl font-bold text-ink">Something slipped.</Text>
      <Text className="mt-3 text-center text-base leading-6 text-muted">The page could not render safely. Your bag and account were not changed.</Text>
      <Pressable accessibilityRole="button" onPress={() => this.setState({ error: null })} className="mt-6 min-h-[48px] items-center justify-center rounded-xl bg-accent px-8">
        <Text className="font-bold text-white">Try again</Text>
      </Pressable>
    </View>;
  }
}
