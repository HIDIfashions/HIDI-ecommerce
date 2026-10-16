/** Keep only ASCII digits and one optional leading country-code plus. */
export function sanitizeCheckoutPhone(value: string) {
  const text = value.trimStart();
  return (text.startsWith("+") ? "+" : "") + text.replace(/[^0-9]/g, "").slice(0, 15);
}
