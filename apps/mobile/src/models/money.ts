/** Display integer minor units without silently rounding a payable amount. */
export function formatINRPaise(value: number): string {
  if (!Number.isSafeInteger(value)) return "Amount unavailable";
  const fractions = Math.abs(value) % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: fractions, maximumFractionDigits: fractions }).format(value / 100);
}
