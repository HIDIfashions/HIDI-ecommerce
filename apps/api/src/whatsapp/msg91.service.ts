import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { WhatsAppService } from "./whatsapp.service.js";
import { digits, Msg91Inbound, parseMsg91Inbound, sendMsg91Text, SESSION_MS, verifyMsg91Token } from "./msg91-protocol.js";

@Injectable()
export class Msg91WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Msg91WhatsAppService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  configuration() {
    const sender = digits(process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER);
    const authkey = process.env.MSG91_WHATSAPP_AUTHKEY || process.env.MSG91_AUTHKEY;
    const token = process.env.MSG91_WHATSAPP_WEBHOOK_TOKEN;
    const start = process.env.WHATSAPP_CHATBOT_START_AT || "";
    const cutoff = new Date(start);
    const origin = process.env.WEB_ORIGIN?.split(",")[0]?.trim();
    const enabled = process.env.WHATSAPP_CHATBOT_ENABLED === "true" && process.env.WHATSAPP_CHATBOT_PROVIDER === "msg91";
    const ready = !!(sender && authkey && token && token.length >= 32 && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(start) &&
      Number.isFinite(cutoff.getTime()) && origin && /^https:\/\/[^/?#]+\/?$/.test(origin));
    return { sender, authkey, token, cutoff, enabled, ready };
  }

  async inbound(token: string | undefined, body: unknown) {
    const config = this.configuration();
    verifyMsg91Token(token, config.token);
    if (!config.enabled || !config.ready) throw new ServiceUnavailableException("WhatsApp ordering is not ready");
    const message = parseMsg91Inbound(body, config.sender!, config.cutoff);
    if (!message) return { accepted: true, ignored: true };
    const allowed = (process.env.WHATSAPP_CHATBOT_TEST_NUMBERS || "").split(",").map(v => v.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(message.phone.slice(1))) return { accepted: true, ignored: true };
    try {
      await this.prisma.$transaction(async tx => {
        const conversation = await tx.whatsAppConversation.upsert({ where: { phone: message.phone }, create: { phone: message.phone }, update: {} });
        await tx.whatsAppMessage.create({ data: { conversationId: conversation.id, providerMessageSid: message.key,
          direction: "INBOUND", body: JSON.stringify(message), status: "MSG91_PENDING" } });
      });
    } catch (error) {
      // A unique-key collision is a duplicate only if this exact message exists.
      if ((error as { code?: string }).code !== "P2002" || !await this.prisma.whatsAppMessage.findUnique({ where: { providerMessageSid: message.key } })) throw error;
    }
    return { accepted: true };
  }

  onModuleInit() {
    this.timer = setInterval(() => { void this.tick(); }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    const config = this.configuration();
    if (this.running || !config.enabled || !config.ready) return;
    this.running = true;
    try {
      const incoming = await this.prisma.whatsAppMessage.findMany({ where: { status: "MSG91_PENDING" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 });
      for (const row of incoming) {
        if (!this.configuration().enabled) break;
        try { await this.processQueued(row.id, row.conversationId); }
        catch { this.logger.error("MSG91 inbound processing failed; transaction rolled back and message remains queued"); }
      }
      const outgoing = await this.prisma.whatsAppMessage.findMany({ where: { status: "MSG91_PENDING_SEND" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 });
      for (const row of outgoing) {
        if (!this.configuration().enabled) break;
        await this.sendQueued(row.id);
      }
    } catch { this.logger.error("MSG91 queue unavailable; no automatic resend of uncertain submissions"); }
    finally { this.running = false; }
  }

  async processQueued(id: string, conversationId: string) {
    await this.prisma.$transaction(async tx => {
      // SQL holds the conversation's update lock until commit. Replicas serialize
      // decisions for one phone; cart, reply and processed marker commit together.
      const conversation = await tx.whatsAppConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      const row = await tx.whatsAppMessage.findFirst({ where: { conversationId, status: "MSG91_PENDING" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (!row || row.id !== id) return;
      const message = JSON.parse(row.body) as Msg91Inbound;
      const receivedAt = new Date(message.receivedAt);
      const config = this.configuration();
      if (!config.enabled || !config.ready) return;
      const stale = message.sender !== config.sender || receivedAt < config.cutoff ||
        Date.now() - receivedAt.getTime() >= SESSION_MS ||
        (conversation.lastInboundAt && receivedAt < conversation.lastInboundAt);
      if (stale) {
        await tx.whatsAppMessage.update({ where: { id }, data: { status: "MSG91_IGNORED" } });
        return;
      }
      await new WhatsAppService(tx as unknown as PrismaService).handleQueuedMessage(conversation, message.phone, message.text, message.key);
      await tx.whatsAppConversation.update({ where: { id: conversationId }, data: { lastInboundAt: receivedAt } });
      await tx.whatsAppMessage.update({ where: { id }, data: { status: "MSG91_PROCESSED" } });
    }, { timeout: 15000 });
  }

  async sendQueued(id: string) {
    const config = this.configuration();
    if (!config.enabled || !config.ready) return;
    const row = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    if (!row || row.status !== "MSG91_PENDING_SEND") return;
    const inbound = await this.prisma.whatsAppMessage.findUnique({ where: { providerMessageSid: row.providerMessageSid.replace(/:reply$/, "") } });
    if (!inbound) return;
    const message = JSON.parse(inbound.body) as Msg91Inbound;
    const expired = message.sender !== config.sender || new Date(message.receivedAt) < config.cutoff ||
      Date.now() - Date.parse(message.receivedAt) >= SESSION_MS;
    const claim = await this.prisma.whatsAppMessage.updateMany({ where: { id, status: "MSG91_PENDING_SEND" },
      data: { status: expired ? "MSG91_EXPIRED" : "MSG91_SENDING" } });
    if (expired || claim.count !== 1) return;
    const status = await sendMsg91Text(config.authkey!, config.sender!, message.phone, row.body);
    await this.prisma.whatsAppMessage.update({ where: { id }, data: { status } });
    // SENDING after a crash and UNKNOWN after a timeout both require provider-log
    // reconciliation. Neither is eligible for automatic resubmission.
  }
}
