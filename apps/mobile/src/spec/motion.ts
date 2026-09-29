export const HidiMotion = {
  M1: { name: "Launch", enterMs: 160, reducedMotion: "immediate" },
  M2: { name: "Route push/back", forwardMs: 260, backMs: 220, reducedMotion: "crossfade" },
  M3: { name: "Bottom sheet", enterMs: 300, exitMs: 220, reducedMotion: "fade" },
  M4: { name: "Root tabs", crossfadeMs: 140, reducedMotion: "immediate" },
  M5: { name: "Product gallery", minMs: 220, maxMs: 280, reducedMotion: "none" },
  M6: { name: "Micro feedback", pressMs: 100, saveMs: 160, successMs: 180, reducedMotion: "state-only" },
  M7: { name: "Loading", shimmerMs: 1200, reducedMotion: "static" },
  M8: { name: "External / OS", reducedMotion: "native" },
} as const;
