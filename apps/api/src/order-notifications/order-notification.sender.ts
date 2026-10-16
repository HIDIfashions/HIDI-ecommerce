import { Injectable } from "@nestjs/common";
import { orderMessage, recipient, type NotificationChannel, type NotificationOrder } from "./order-message.js";
export type PreparedNotification = { provider: "RESEND" | "MSG91"; body: Record<string, unknown> };
export type SendResult = { status: "SENT" | "RETRY" | "FAILED" | "UNKNOWN"; error: string | null; messageId?: string };
@Injectable()
export class OrderNotificationSender {
  configured(provider: string): boolean {
    if (provider === "RESEND") return Boolean(process.env.RESEND_API_KEY);
    if (provider === "MSG91") return Boolean(process.env.MSG91_WHATSAPP_AUTHKEY || process.env.MSG91_AUTHKEY);
    return false;
  }
  prepare(order: NotificationOrder, channel: NotificationChannel): PreparedNotification | null {
    const to = recipient(order, channel);
    if (!to) return null;
    const message = orderMessage(order);
    if (channel === "EMAIL") {
      // Require an explicitly verified transactional sender; no test sender fallback.
      const from = process.env.ORDER_FROM_EMAIL?.trim();
      if (!from || /[\r\n]/.test(from) || !this.configured("RESEND")) return null;
      return { provider: "RESEND", body: { from, to: [to], subject: message.subject, text: message.text, html: message.html } };
    }
    const number = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;
    const template = process.env.MSG91_ORDER_TEMPLATE_NAME;
    const namespace = process.env.MSG91_ORDER_TEMPLATE_NAMESPACE;
    if (!number || !template || !namespace || !this.configured("MSG91")) return null;
    return { provider: "MSG91", body: {
      integrated_number: number, content_type: "template",
      payload: { messaging_product: "whatsapp", type: "template", template: {
        name: template, namespace,
        language: { code: process.env.MSG91_ORDER_TEMPLATE_LANGUAGE || "en", policy: "deterministic" },
        to_and_components: [{ to: [to], components: Object.fromEntries(message.whatsappVariables.map((value, index) =>
          [`body_${index + 1}`, { type: "text", value }])) }],
      } },
    } };
  }
  async send(id: string, prepared: PreparedNotification): Promise<SendResult> {
    const email = prepared.provider === "RESEND";
    try {
      const response = await fetch(email ? "https://api.resend.com/emails" : "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        method: "POST", signal: AbortSignal.timeout(15000), redirect: "error",
        headers: email ? {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
          "Idempotency-Key": `hidi-order-confirmation/${id}`,
        } : { authkey: process.env.MSG91_WHATSAPP_AUTHKEY || process.env.MSG91_AUTHKEY || "", "Content-Type": "application/json" },
        body: JSON.stringify(prepared.body),
      });
      // Never persist or log provider error text, recipient details or credentials.
      const body = await response.json().catch(() => null) as any;
      if (response.ok) {
        const messageId = email ? body?.id : body?.request_id;
        const accepted = email || (body?.status === "success" || body?.type === "success") && body?.hasError !== true;
        if (accepted && typeof messageId === "string" && messageId.length > 0 && messageId.length <= 191) {
          return { status: "SENT", error: null, messageId };
        }
        return { status: email ? "RETRY" : "UNKNOWN", error: "PROVIDER_ACK_UNCLEAR" };
      }
      if (response.status === 429) return { status: "RETRY", error: "PROVIDER_RATE_LIMIT" };
      if (email && response.status === 409 && body?.name === "concurrent_idempotent_requests") {
        return { status: "RETRY", error: "PROVIDER_REQUEST_IN_PROGRESS" };
      }
      if (response.status >= 500 || response.status === 408) {
        return { status: email ? "RETRY" : "UNKNOWN", error: `PROVIDER_HTTP_${response.status}` };
      }
      return { status: "FAILED", error: `PROVIDER_HTTP_${response.status}` };
    } catch {
      return { status: email ? "RETRY" : "UNKNOWN", error: "PROVIDER_NETWORK_UNCLEAR" };
    }
  }
}
