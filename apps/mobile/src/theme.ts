export const colors = {
  canvas: "#FFFFFF",
  ink: "#1C1C1E",
  muted: "#6E6E73",
  line: "#ECECEF",
  soft: "#F7F7F9",
  accent: "#FF3F6C",
  success: "#178A54",
  sale: "#E53935",
  gold: "#B58A42",
} as const;

export const shadows = {
  card: { shadowColor: "#1C1C1E", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  floating: { shadowColor: "#1C1C1E", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 8 },
} as const;
