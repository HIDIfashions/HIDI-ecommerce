export type NotificationChannel = "EMAIL" | "WHATSAPP";
export type NotificationOrder = {
  id: string; orderNumber: string; status: string; currency: string;
  customerEmail: string | null; customerPhone: string; shippingAddress: unknown;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; taxPaise: number;
  totalPaise: number; walletAppliedPaise: number;
  items: Array<{ id: string; productName: string; size: string; color: string; quantity: number; totalPaise: number }>;
};
export const NOTIFIABLE_STATES = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim() : "";
export function orderAddress(order: NotificationOrder): Record<string, unknown> {
  try {
    const value = typeof order.shippingAddress === "string" ? JSON.parse(order.shippingAddress) : order.shippingAddress;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function recipient(order: NotificationOrder, channel: NotificationChannel): string | null {
  if (channel === "EMAIL") {
    const value = (order.customerEmail ?? "").trim();
    return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null;
  }
  const digits = order.customerPhone.replace(/\D/g, "");
  const value = digits.length === 10 ? "91" + digits : digits;
  return /^91[6-9]\d{9}$/.test(value) ? value : null;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export function money(paise: number): string { return `INR ${(paise / 100).toFixed(2)}`; }
export function orderMessage(order: NotificationOrder) {
  const a = orderAddress(order);
  const name = clean(a.firstName) || "there";
  const items = [...order.items].sort((a, b) => a.id.localeCompare(b.id)).map(item =>
    `${clean(item.productName)} (${[clean(item.size), clean(item.color)].filter(Boolean).join(" / ")}) x ${item.quantity} — ${money(item.totalPaise)}`);
  const address = [
    [clean(a.firstName), clean(a.lastName)].filter(Boolean).join(" "), clean(a.line1), clean(a.line2),
    [clean(a.city), clean(a.state), clean(a.postalCode)].filter(Boolean).join(", "),
    clean(a.countryCode) || "IN",
  ].filter(Boolean).join(", ");
  const totals = [
    `Subtotal: ${money(order.subtotalPaise)}`, `Discount: ${money(order.discountPaise)}`,
    `Shipping: ${money(order.shippingPaise)}`, `Tax: ${money(order.taxPaise)}`,
    `Total paid: ${money(order.totalPaise)}`,
    ...(order.walletAppliedPaise > 0 ? [`HIDI wallet: ${money(order.walletAppliedPaise)}`, `Payment gateway: ${money(order.totalPaise - order.walletAppliedPaise)}`] : []),
  ];
  const lines = [`Hi ${name},`, "", `Your HIDI order ${clean(order.orderNumber)} is confirmed.`,
    "We have received your payment.", "", ...items, "", ...totals, "", `Delivery address: ${address}`,
    "", "We will update you when your order is dispatched.", "Thank you for shopping with HIDI."];
  return {
    subject: `HIDI order ${clean(order.orderNumber)} confirmed`, text: lines.join("\n"),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#29211c"><main style="max-width:600px;margin:auto;padding:24px"><h1>HIDI</h1>${lines.map(line => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("")}</main></body></html>`,
    // Utility template body variables: name, order number, item summary, total, address.
    whatsappVariables: [name, clean(order.orderNumber), items.join("; ").slice(0, 900), money(order.totalPaise), address.slice(0, 700)],
  };
}
