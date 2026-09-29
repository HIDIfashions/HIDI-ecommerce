export const HidiAccessibilityContract = {
  minimumTouchTargetDp: 48,
  bodySp: 16,
  secondarySp: 14,
  metadataSp: 12,
  normalTextContrast: 4.5,
  largeTextContrast: 3,
  referenceWidthsDp: [320, 360, 390, 412],
  requiredChecks: [
    "TalkBack",
    "Switch Access",
    "External keyboard",
    "200% text",
    "Reduced motion",
    "Predictive back",
    "Light and dark appearance",
  ],
} as const;
