import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twiml(message: string) {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + xmlEscape(message) + "</Message></Response>";
}

function normalizeWhatsappAddress(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  const raw = text.toLowerCase().startsWith("whatsapp:") ? text.slice(9) : text;
  const digits = raw.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? "+" + digits : null;
}

function bodyText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseQuantity(text: string) {
  const match = text.match(/Quantity:\s*(\d{1,2})/i);
  const value = match ? Number(match[1]) : 1;
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), 10) : 1;
}

function parseSku(text: string) {
  const match = text.match(/SKU:\s*([^\n\r]+)/i);
  return match?.[1]?.trim().slice(0, 120) ?? null;
}

function contextObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

@Injectable()
export class WhatsAppService {
  constructor(private readonly prisma: PrismaService) {}

  enabled() {
    return process.env.WHATSAPP_CHATBOT_ENABLED === "true";
  }

  assertValidTwilioWebhook(signature: string | undefined, body: Record<string, unknown>) {
    if (process.env.WHATSAPP_TWILIO_SIGNATURE_VALIDATION === "false") return;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const webhookUrl = process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
    if (!token || !webhookUrl || !signature) {
      throw new UnauthorizedException("Invalid WhatsApp webhook signature");
    }

    const payload = Object.keys(body)
      .sort()
      .reduce((value, key) => value + key + String(body[key] ?? ""), webhookUrl);
    const expected = createHmac("sha1", token).update(payload).digest("base64");
    const received = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) {
      throw new UnauthorizedException("Invalid WhatsApp webhook signature");
    }
  }

  private async conversation(phone: string) {
    return this.prisma.whatsAppConversation.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });
  }

  private async rememberMessage(
    conversationId: string,
    providerMessageSid: string,
    direction: "INBOUND" | "OUTBOUND",
    body: string,
  ) {
    await this.prisma.whatsAppMessage.upsert({
      where: { providerMessageSid },
      create: {
        conversationId,
        providerMessageSid,
        direction,
        body,
        status: direction === "INBOUND" ? "RECEIVED" : "SENT",
      },
      update: {},
    });
  }

  private async setState(id: string, state: string, context: Record<string, unknown> = {}) {
    await this.prisma.whatsAppConversation.update({
      where: { id },
      data: { state, context },
    });
  }

  private async reply(conversationId: string, providerSid: string, message: string) {
    await this.rememberMessage(conversationId, providerSid + ":reply", "OUTBOUND", message);
    return twiml(message);
  }

  private menu() {
    return [
      "Welcome to HIDI ✨",
      "",
      "Reply with:",
      "1 - Shop new arrivals",
      "2 - Check an order",
      "3 - Fit & size help",
      "4 - Human support",
      "",
      "Or tap Order on WhatsApp on any HIDI product and I’ll pick up your exact selection here.",
    ].join("\n");
  }

  async handleInbound(body: Record<string, unknown>) {
    const phone = normalizeWhatsappAddress(body.From);
    const message = bodyText(body.Body);
    const providerSid = bodyText(body.MessageSid || body.SmsMessageSid);
    if (!phone || !providerSid) {
      throw new BadRequestException("Invalid WhatsApp webhook payload");
    }

    const conversation = await this.conversation(phone);
    await this.rememberMessage(conversation.id, providerSid, "INBOUND", message);
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: new Date() },
    });

    const normalized = message.trim().toUpperCase();

    if (["STOP", "UNSUBSCRIBE", "CANCEL SUBSCRIPTION"].includes(normalized)) {
      await this.prisma.retentionProfile.updateMany({
        where: { verifiedPhone: phone },
        data: { whatsappOptIn: false, consentUpdatedAt: new Date() },
      });
      await this.setState(conversation.id, "IDLE");
      return this.reply(
        conversation.id,
        providerSid,
        "You’ve been opted out of HIDI WhatsApp marketing. You can still message us anytime for order or product support.",
      );
    }

    if (normalized === "START") {
      return this.reply(
        conversation.id,
        providerSid,
        "WhatsApp support is available. Marketing messages remain off unless you enable them in your HIDI account.\n\n" + this.menu(),
      );
    }

    const sku = parseSku(message);
    if (sku) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { sku },
        include: { product: true, inventory: true },
      });
      if (!variant || !variant.active || variant.product.status !== "ACTIVE") {
        await this.setState(conversation.id, "IDLE");
        return this.reply(
          conversation.id,
          providerSid,
          "I couldn’t find that HIDI product selection. Please reopen the product page and tap Order on WhatsApp again.",
        );
      }

      const available = variant.inventory
        ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock)
        : 0;
      if (available < 1) {
        await this.setState(conversation.id, "IDLE");
        return this.reply(
          conversation.id,
          providerSid,
          variant.product.name + " / " + variant.size + " is currently sold out. Reply 1 to browse new arrivals or 4 for human help.",
        );
      }

      const quantity = Math.min(parseQuantity(message), available);
      const subtotalPaise = variant.pricePaise * quantity;
      await this.setState(conversation.id, "AWAITING_ORDER_CONFIRMATION", {
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        quantity,
      });

      return this.reply(
        conversation.id,
        providerSid,
        [
          "I’ve checked your HIDI selection ✨",
          "",
          variant.product.name,
          "Colour: " + variant.color,
          "Size: " + variant.size,
          "Quantity: " + quantity,
          "Subtotal: ₹" + (subtotalPaise / 100).toLocaleString("en-IN"),
          "",
          "Reply YES to create your secure HIDI checkout, or CANCEL to stop.",
        ].join("\n"),
      );
    }

    if (conversation.state === "AWAITING_ORDER_CONFIRMATION") {
      if (normalized === "CANCEL") {
        await this.setState(conversation.id, "IDLE");
        return this.reply(
          conversation.id,
          providerSid,
          "No problem — I cancelled that order request. Reply MENU whenever you want to continue.",
        );
      }

      if (normalized === "YES") {
        const context = contextObject(conversation.context);
        const variantId = typeof context.variantId === "string" ? context.variantId : "";
        const requestedQuantity = typeof context.quantity === "number" ? context.quantity : 1;
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
          include: { product: true, inventory: true },
        });

        if (!variant || !variant.active || variant.product.status !== "ACTIVE" || !variant.inventory) {
          await this.setState(conversation.id, "IDLE");
          return this.reply(
            conversation.id,
            providerSid,
            "That selection is no longer available. Please choose the product again on HIDI.",
          );
        }

        const available = Math.max(
          0,
          variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock,
        );
        if (available < requestedQuantity) {
          await this.setState(conversation.id, "IDLE");
          return this.reply(
            conversation.id,
            providerSid,
            "Availability changed before checkout. Please choose the product again so I can re-check the latest stock.",
          );
        }

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const cart = await this.prisma.cart.create({
          data: { sessionId, expiresAt },
        });
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: variant.productId,
            variantId: variant.id,
            quantity: requestedQuantity,
            unitPricePaise: variant.pricePaise,
          },
        });

        const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
          .split(",")[0]!
          .trim()
          .replace(/\/$/, "");
        const checkoutUrl = webOrigin + "/checkout?waCart=" + encodeURIComponent(sessionId);
        await this.setState(conversation.id, "CHECKOUT_READY", {
          cartSessionId: sessionId,
          variantId: variant.id,
        });

        return this.reply(
          conversation.id,
          providerSid,
          [
            "Your HIDI bag is ready ✅",
            "",
            variant.product.name + " · " + variant.color + " · Size " + variant.size + " · Qty " + requestedQuantity,
            "",
            "Complete delivery details and secure payment here:",
            checkoutUrl,
            "",
            "Stock is checked again when checkout is prepared. Payment stays on HIDI/Razorpay — never send card or UPI PIN details in WhatsApp.",
          ].join("\n"),
        );
      }
    }

    const orderMatch = message.match(/\bHIDI-\d{8}-[A-Z0-9]{6}\b/i);
    if (orderMatch || normalized.startsWith("ORDER ")) {
      const orderNumber = orderMatch?.[0]?.toUpperCase() ?? message.slice(6).trim().toUpperCase();
      const order = await this.prisma.order.findFirst({
        where: {
          orderNumber,
          customerPhone: { in: [phone, phone.replace(/^\+/, "")] },
        },
        select: {
          orderNumber: true,
          status: true,
          totalPaise: true,
        },
      });
      if (!order) {
        return this.reply(
          conversation.id,
          providerSid,
          "I couldn’t find that order for this WhatsApp number. Check the order number or reply 4 for human support.",
        );
      }

      return this.reply(
        conversation.id,
        providerSid,
        [
          "Order " + order.orderNumber,
          "Status: " + order.status.replaceAll("_", " "),
          "Total: ₹" + (order.totalPaise / 100).toLocaleString("en-IN"),
          "",
          "Reply 4 if you need a HIDI team member to help with this order.",
        ].join("\n"),
      );
    }

    if (["HI", "HELLO", "HEY", "MENU", "HELP"].includes(normalized) || !message) {
      await this.setState(conversation.id, "IDLE");
      return this.reply(conversation.id, providerSid, this.menu());
    }

    if (normalized === "1" || normalized.includes("NEW ARRIVAL")) {
      const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
        .split(",")[0]!
        .trim()
        .replace(/\/$/, "");
      return this.reply(
        conversation.id,
        providerSid,
        "Explore HIDI new arrivals here:\n" + webOrigin + "/collections/new-arrivals\n\nChoose a product and tap Order on WhatsApp — I’ll verify the exact size, colour, price and stock.",
      );
    }

    if (normalized === "2") {
      return this.reply(
        conversation.id,
        providerSid,
        "Send your HIDI order number, for example: HIDI-20260919-ABC123",
      );
    }

    if (normalized === "3" || normalized.includes("SIZE") || normalized.includes("FIT")) {
      await this.setState(conversation.id, "FIT_HELP");
      return this.reply(
        conversation.id,
        providerSid,
        "Tell me the product name or SKU and the size you usually wear. For the most accurate help, open the product on HIDI and tap Order on WhatsApp.",
      );
    }

    if (normalized === "4" || normalized.includes("HUMAN") || normalized.includes("AGENT")) {
      await this.setState(conversation.id, "HUMAN_HANDOFF");
      return this.reply(
        conversation.id,
        providerSid,
        "I’ve marked this chat for human support. A HIDI team member can continue from here. Please include your question and, if relevant, your order number.",
      );
    }

    return this.reply(
      conversation.id,
      providerSid,
      "I can help with products, sizes and HIDI orders.\n\n" + this.menu(),
    );
  }
}
