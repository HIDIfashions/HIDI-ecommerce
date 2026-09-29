export const hidiColors = {
  light: {
    canvas: "#FAF8F4",
    action: "#702B42",
    ink: "#2B2427",
    blush: "#F0E5E8",
    success: "#4C654D",
    caution: "#7A541E",
    error: "#A12C3A",
    surface: "#FFFFFF",
    border: "#DED5D2",
    mutedText: "#6B6265",
  },
  dark: {
    canvas: "#211B20",
    action: "#D393AA",
    ink: "#F6ECEF",
    blush: "#33272F",
    success: "#7E9A80",
    caution: "#D3A75E",
    error: "#E26F7C",
    surface: "#2A2228",
    border: "#4A3B44",
    mutedText: "#C9BBC2",
  },
} as const;

export const hidiSpacing = {
  x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32, x10: 40, x12: 48,
  outerGutter: 20, gridGap: 12, sectionGap: 24,
} as const;

export const hidiRadius = { control: 8, card: 12, sheet: 24 } as const;

export const hidiType = {
  display: { fontSize: 32, lineHeight: 36 },
  title: { fontSize: 24, lineHeight: 30 },
  body: { fontSize: 16, lineHeight: 24 },
  secondary: { fontSize: 14, lineHeight: 20 },
  metadata: { fontSize: 12, lineHeight: 16 },
} as const;

export const hidiAccessibility = {
  minTouchTarget: 48,
  normalTextContrast: 4.5,
  largeTextContrast: 3,
} as const;

export const hidiMotion = {
  launchFadeMs: 160,
  routeForwardMs: 260,
  routeBackMs: 220,
  sheetEnterMs: 300,
  sheetExitMs: 220,
  rootTabCrossfadeMs: 140,
  galleryMs: 240,
  pressMs: 100,
  saveMs: 160,
  successMs: 180,
  shimmerMs: 1200,
} as const;
