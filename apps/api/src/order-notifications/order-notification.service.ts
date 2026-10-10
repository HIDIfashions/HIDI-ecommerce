import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NOTIFIABLE_STATES, recipient, type NotificationChannel } from "./order-message.js";
import { OrderNotificationStore, type NotificationJob } from "./order-notification.store.js";
import { OrderNotificationSender, type PreparedNotification } from "./order-notification.sender.js";
export function notificationConfig() {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  const value = process.env.ORDER_NOTIFICATIONS_START_AT || "";
  const startAt = new Date(value);
  const valid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(startAt.getTime());
  const channels: NotificationChannel[] = [];
  if (process.env.ORDER_EMAIL_ENABLED !== "false") channels.push("EMAIL");
  if (process.env.ORDER_WHATSAPP_ENABLED === "true") channels.push("WHATSAPP");
  return { enabled: enabled && valid && channels.length > 0, startAt: valid ? startAt : null, channels };
}
@Injectable()
export class OrderNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderNotificationService.name);
  private running = false;
  private stopped = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly store: OrderNotificationStore, private readonly sender: OrderNotificationSender) {}
  onModuleInit() {
    if (!notificationConfig().enabled) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => {
      this.logger.warn("Order notification worker paused after a database error; payment processing is unaffected");
    }), 10000);
    this.timer.unref();
  }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearInterval(this.timer); }
  async runOnce() {
    const config = notificationConfig();
    if (!config.enabled || !config.startAt || this.running || this.stopped) return { skipped: true };
    this.running = true;
    let processed = 0;
    try {
      for (const channel of config.channels) await this.store.enqueue(channel, config.startAt);
      await this.store.recover();
      for (let i = 0; i < 5 && !this.stopped; i++) {
        const job = await this.store.claim(randomUUID());
        if (!job) break;
        // A paused channel must not submit even if its old queue has pending rows.
        if (!config.channels.includes(job.channel)) {
          await this.store.finish(job, "WAITING_CONFIG", "CHANNEL_DISABLED", null, 300); continue;
        }
        await this.process(job); processed++;
      }
      return { processed };
    } finally { this.running = false; }
  }
  private async process(job: NotificationJob) {
    const order = await this.store.order(job.orderId);
    if (!order || !NOTIFIABLE_STATES.includes(order.status) || order.currency !== "INR") {
      await this.store.finish(job, "SKIPPED", "ORDER_NO_LONGER_ELIGIBLE"); return;
    }
    if (job.channel === "WHATSAPP" && !order.whatsappOptIn) {
      await this.store.finish(job, "SKIPPED", "WHATSAPP_CONSENT_NOT_PRESENT"); return;
    }
    if (!job.payload && !recipient(order, job.channel)) {
      await this.store.finish(job, "SKIPPED", "RECIPIENT_MISSING_OR_INVALID"); return;
    }
    if (job.firstAttemptAt && Date.now() - job.firstAttemptAt.getTime() >= 23 * 3600000) {
      // Never submit again once provider deduplication protection may have expired.
      await this.store.finish(job, "UNKNOWN", "IDEMPOTENCY_WINDOW_EXPIRED"); return;
    }
    if (job.attempts >= 6) { await this.store.finish(job, "FAILED", "RETRY_LIMIT_REACHED"); return; }
    let prepared: PreparedNotification | null;
    try {
      prepared = job.payload ? JSON.parse(job.payload) : this.sender.prepare(order, job.channel);
    } catch { await this.store.finish(job, "FAILED", "PAYLOAD_INVALID"); return; }
    if (!prepared || !this.sender.configured(prepared.provider)) {
      await this.store.finish(job, "WAITING_CONFIG", "PROVIDER_NOT_CONFIGURED", null, 300); return;
    }
    const payload = job.payload || JSON.stringify(prepared);
    if (!await this.store.beginSend(job, prepared.provider, payload)) return;
    const result = await this.sender.send(job.id, prepared);
    const delay = Math.min(3600, 60 * 2 ** job.attempts);
    await this.store.finish(job, result.status, result.error, result.messageId ?? null, result.status === "RETRY" ? delay : 0);
  }
  async status() {
    const config = notificationConfig();
    const schemaReady = await this.store.schemaReady();
    return { enabled: config.enabled, schemaReady, startAt: config.startAt?.toISOString() ?? null, channels: config.channels,
      providerCredentials: { email: this.sender.configured("RESEND"), whatsapp: this.sender.configured("MSG91") },
      counts: schemaReady ? await this.store.summary() : [] };
  }
}
