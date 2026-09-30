/** Technical build approval must not activate an absent payment bridge or a commercial policy. */
export const releaseGates = Object.freeze({
  nativePaymentHandoff: false,
  liveOtpVerified: false,
  liveOrderReconciliationVerified: false,
  accountIsolationVerified: false,
  livePrivacyDeletionVerified: false,
  merchantPolicyApproved: false,
  productionSigningApproved: false,
  physicalDeviceAccessibilitySignedOff: false,
  visualBaselinesApproved: false,
});
export function assertPaymentHandoffAvailable() {
  if (!releaseGates.nativePaymentHandoff) throw new Error("Secure payment is not active in this internal build. No payment attempt was created.");
}
export function productionBlockers() {
  return Object.entries(releaseGates).filter(([, ready]) => !ready).map(([name]) => name);
}
