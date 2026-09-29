import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { PackageCheck, UserRound } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { HidiButton } from "../../components/HidiButton";
import { HidiText } from "../../components/HidiText";
import { useAuth } from "../../auth/AuthContext";
import { maskPhone } from "../../auth/session";
import { useHidiTheme } from "../../theme/HidiTheme";

export default function YouPlaceholderScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useHidiTheme();
  const auth = useAuth();
  const name = typeof auth.session?.user.user_metadata?.first_name === "string" ? String(auth.session?.user.user_metadata?.first_name) : "";

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}> 
      <UserRound size={34} color={colors.action} />
      <HidiText variant="title">{auth.session ? (name ? "Hello, " + name + "." : "Your HIDI") : "Your HIDI"}</HidiText>
      {auth.session?.user.phone ? <HidiText variant="secondary" style={{ color: colors.mutedText }}>{maskPhone(auth.session.user.phone)}</HidiText> : null}
      {auth.session ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("MyOrders")} style={[styles.orderLink, { borderColor: colors.border }]}> 
            <PackageCheck size={20} color={colors.action} />
            <View style={{ flex: 1 }}>
              <HidiText variant="secondary" style={styles.bold}>My orders</HidiText>
              <HidiText variant="metadata" style={{ color: colors.mutedText }}>Track shipments, returns, exchanges and reviews.</HidiText>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void auth.signOut()} style={styles.signOut}>
            <HidiText variant="action" style={{ color: colors.action }}>Sign out</HidiText>
          </Pressable>
        </>
      ) : (
        <>
          <HidiText variant="secondary" style={[styles.center, { color: colors.mutedText }]}>Browsing and saving remain available without signing in.</HidiText>
          <HidiButton label="Sign in / join HIDI" onPress={() => navigation.navigate("SignIn")} style={{ alignSelf: "stretch" }} />
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("MyOrders")} style={styles.signOut}>
            <HidiText variant="metadata" style={{ color: colors.action }}>Find an order after sign-in</HidiText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  center: { textAlign: "center" },
  signOut: { minHeight: 48, justifyContent: "center" },
  orderLink: { alignSelf: "stretch", minHeight: 76, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  bold: { fontWeight: "600" },
});
