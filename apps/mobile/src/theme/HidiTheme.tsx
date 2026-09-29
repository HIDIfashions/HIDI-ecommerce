import React, { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { hidiColors } from "./tokens";

export type HidiThemeMode = "light" | "dark";
export type HidiTheme = {
  mode: HidiThemeMode;
  colors: (typeof hidiColors)[HidiThemeMode];
};

const ThemeContext = createContext<HidiTheme>({
  mode: "light",
  colors: hidiColors.light,
});

export function HidiThemeProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme();
  const mode: HidiThemeMode = systemMode === "dark" ? "dark" : "light";
  const value = useMemo(() => ({ mode, colors: hidiColors[mode] }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useHidiTheme() {
  return useContext(ThemeContext);
}
