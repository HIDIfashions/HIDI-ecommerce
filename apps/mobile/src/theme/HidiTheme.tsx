import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { hidiColors } from "./tokens";
import { effectiveTheme } from "../models/system";
import type { AppearancePreference } from "../models/system";
import { systemStorage } from "../storage/systemStorage";

export type HidiThemeMode = "light" | "dark";
export type HidiTheme = {
  mode: HidiThemeMode;
  preference: AppearancePreference;
  colors: (typeof hidiColors)[HidiThemeMode];
  setPreference: (value: AppearancePreference) => Promise<void>;
};

const ThemeContext = createContext<HidiTheme>({
  mode: "light",
  preference: "system",
  colors: hidiColors.light,
  setPreference: async () => undefined,
});

export function HidiThemeProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>("system");

  useEffect(() => {
    let alive = true;
    void systemStorage.appearancePreference().then((value) => { if (alive) setPreferenceState(value); });
    return () => { alive = false; };
  }, []);

  const setPreference = useCallback(async (value: AppearancePreference) => {
    setPreferenceState(value);
    await systemStorage.saveAppearancePreference(value);
  }, []);

  const mode = effectiveTheme(preference, systemMode) as HidiThemeMode;
  const value = useMemo(() => ({ mode, preference, colors: hidiColors[mode], setPreference }), [mode, preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useHidiTheme() {
  return useContext(ThemeContext);
}
