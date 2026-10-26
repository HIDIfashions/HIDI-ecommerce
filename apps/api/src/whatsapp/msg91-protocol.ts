import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";

export const SESSION_MS = 24 * 60 * 60 * 1000;
export type Msg91Inbound = { phone: string; sender: string; text: string; receivedAt: string; key: string };
export const digits = (value: unknown) => typeof value === "string" && /^[1-9]\d{7,14}$/.test(value) ? value : null;
const object = (value: unknown): Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};

export function verifyMsg91Token(received: string | undefined, expected: string | undefined) {
  if (!expected || expected.length < 32 || !received) throw new UnauthorizedException("Invalid WhatsApp callback credentials");
  const a = Buffer.from(received), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException("Invalid WhatsApp callback credentials");
}

// Contract: MSG91 Webhook (New), On Inbound Report Received, custom JSON below.
// Outbound delivery reports and non-text events must never enter the order flow.
export function parseMsg91Inbound(raw: unknown, sender: string, cutoff: Date, now = new Date()): Msg91Inbound | null {
  const body = object(raw);
  if (String(body.direction) !== "0" || body.eventName !== "delivered") return null;
  if (body.integratedNumber !== sender) throw new BadRequestException("Unexpected WhatsApp business number");
  if (body.contentType !== "text") return null;
  let messages: unknown = body.messages;
  if (typeof messages === "string") {
    try { messages = JSON.parse(messages); } catch { throw new BadRequestException("Invalid WhatsApp message data"); }
  }
  if (!Array.isArray(messages) || messages.length !== 1) throw new BadRequestException("Expected one WhatsApp message");
  const message = object(messages[0]);
  const phone = digits(body.customerNumber), text = object(message.text).body;
  const id = typeof message.id === "string" ? message.id : "";
  const timestamp = typeof message.timestamp === "string" && /^\d{10}$/.test(message.timestamp) ? Number(message.timestamp) * 1000 : NaN;
  if (!phone || message.from !== phone || message.type !== "text" || !id.startsWith("wamid.") || id.length > 512 ||
      typeof text !== "string" || !text.trim() || text.length > 4096 || !Number.isFinite(timestamp)) {
    throw new BadRequestException("Invalid WhatsApp text message");
  }
  if (timestamp > now.getTime() + 60_000) throw new BadRequestException("Future WhatsApp timestamp");
  if (timestamp < cutoff.getTime() || now.getTime() - timestamp >= SESSION_MS) return null;
  return { phone: "+" + phone, sender, text: text.trim(), receivedAt: new Date(timestamp).toISOString(),
    key: "msg91:" + createHash("sha256").update(sender + ":" + id).digest("hex") };
}

export async function sendMsg91Text(authkey: string, sender: string, phone: string, text: string): Promise<"MSG91_ACCEPTED" | "MSG91_REJECTED" | "MSG91_UNKNOWN"> {
  // Official session-message API documents POST with query parameters. Never
  // log this URL: it contains the customer's message and private checkout link.
  const url = new URL("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/");
  url.search = new URLSearchParams({ integrated_number: sender, recipient_number: phone.replace(/^\+/, ""), content_type: "text", text }).toString();
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(6000),
      headers: { authkey, accept: "application/json", "content-type": "application/json" } });
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return "MSG91_REJECTED";
    if (!response.ok) return "MSG91_UNKNOWN";
    const result = object(await response.json());
    if (result.status === "success" && result.hasError === false && !result.errors) return "MSG91_ACCEPTED";
    if (result.hasError === true || result.status === "error") return "MSG91_REJECTED";
    return "MSG91_UNKNOWN";
  } catch { return "MSG91_UNKNOWN"; }
}
