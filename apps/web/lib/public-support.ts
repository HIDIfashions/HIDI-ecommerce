import { normalizeWhatsAppNumber } from "./product-sharing";
export function publicSupport(env: Record<string, string | undefined> = process.env) {
  const value = env.HIDI_PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
  // Intentionally no fallback to an owner's account, SMTP login or private email.
  const email = /^[a-zA-Z0-9.!#$&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? value : null;
  const hours = env.HIDI_PUBLIC_SUPPORT_HOURS?.trim().slice(0, 180) || null;
  const phone = normalizeWhatsAppNumber(env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER);
  return { email, hours, phone, emailHref: email ? "mailto:" + encodeURIComponent(email).replace(/%40/g, "@") : null };
}
