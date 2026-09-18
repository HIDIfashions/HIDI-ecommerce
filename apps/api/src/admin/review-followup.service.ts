import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class ReviewFollowUpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewFollowUpService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!this.enabled()) {
      this.logger.log("Automatic review follow-up is disabled");
      return;
    }

    const initial = setTimeout(() => {
      void this.runOnce();
    }, 15_000);
    initial.unref();

    this.timer = setInterval(() => {
      void this.runOnce();
    }, 60 * 60 * 1000);
    this.timer.unref();

    this.logger.log("Automatic review follow-up enabled; checking hourly");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private enabled() {
    return String(process.env.REVIEW_FOLLOWUP_ENABLED ?? "").toLowerCase() === "true";
  }

  async list() {
    return this.prisma.reviewFollowUp.findMany({
      orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: {
        order: {
          select: {
            orderNumber: true,
            customerEmail: true,
            customerPhone: true,
            createdAt: true,
            status: true,
          },
        },
      },
    });
  }

  async runOnce() {
    if (this.running) return { skipped: true, reason: "already_running" };
    this.running = true;

    try {
      if (!this.enabled()) return { skipped: true, reason: "disabled" };

      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from = process.env.REVIEW_FROM_EMAIL?.trim();
      const reviewUrl = process.env.REVIEW_URL?.trim();

      if (!apiKey || !from || !reviewUrl) {
        this.logger.warn("Review follow-up enabled but RESEND_API_KEY, REVIEW_FROM_EMAIL or REVIEW_URL is missing");
        return { skipped: true, reason: "missing_configuration" };
      }

      const now = new Date();
      const cutoff = new Date(now.getTime() - 3 * DAY_MS);

      const eligible = await this.prisma.order.findMany({
        where: {
          status: "DELIVERED" as any,
          createdAt: { lte: cutoff },
          customerEmail: { not: null },
          reviewFollowUps: {
            none: { channel: "EMAIL" as any },
          },
        },
        include: {
          items: {
            select: {
              productName: true,
              quantity: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      });

      for (const order of eligible) {
        await this.prisma.reviewFollowUp.create({
          data: {
            orderId: order.id,
            channel: "EMAIL" as any,
            status: "PENDING" as any,
            dueAt: now,
          },
        }).catch((error: any) => {
          if (error?.code !== "P2002") throw error;
        });
      }

      const pending = await this.prisma.reviewFollowUp.findMany({
        where: {
          channel: "EMAIL" as any,
          status: { in: ["PENDING", "FAILED"] as any },
          dueAt: { lte: now },
          attempts: { lt: MAX_ATTEMPTS },
        },
        include: {
          order: {
            include: {
              items: {
                select: {
                  productName: true,
                  quantity: true,
                },
              },
            },
          },
        },
        orderBy: { dueAt: "asc" },
        take: 50,
      });

      let sent = 0;
      let failed = 0;

      for (const followUp of pending) {
        const email = followUp.order.customerEmail?.trim();
        if (!email) {
          await this.markFailed(followUp.id, followUp.attempts, "Customer email is missing");
          failed++;
          continue;
        }

        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [email],
              subject: "How was your HIDI purchase?",
              text: this.textMessage(followUp.order, reviewUrl),
              html: this.htmlMessage(followUp.order, reviewUrl),
            }),
          });

          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body?.message ?? `Resend returned ${response.status}`);
          }

          await this.prisma.reviewFollowUp.update({
            where: { id: followUp.id },
            data: {
              status: "SENT" as any,
              sentAt: new Date(),
              attempts: followUp.attempts + 1,
              lastAttemptAt: new Date(),
              lastError: null,
              providerMessageId: typeof body?.id === "string" ? body.id : null,
            },
          });
          sent++;
        } catch (error) {
          await this.markFailed(
            followUp.id,
            followUp.attempts,
            error instanceof Error ? error.message : "Unable to send review email",
          );
          failed++;
        }
      }

      return {
        eligibleCreated: eligible.length,
        processed: pending.length,
        sent,
        failed,
      };
    } finally {
      this.running = false;
    }
  }

  private async markFailed(id: string, attempts: number, message: string) {
    const nextAttempts = attempts + 1;
    const retryAt = new Date(Date.now() + Math.min(24, 2 ** Math.min(nextAttempts, 4)) * 60 * 60 * 1000);

    await this.prisma.reviewFollowUp.update({
      where: { id },
      data: {
        status: "FAILED" as any,
        attempts: nextAttempts,
        lastAttemptAt: new Date(),
        lastError: message.slice(0, 1000),
        dueAt: retryAt,
      },
    });
  }

  private products(order: { items: Array<{ productName: string; quantity: number }> }) {
    return order.items
      .map((item) => `${item.productName}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`)
      .join(", ");
  }

  private textMessage(order: any, reviewUrl: string) {
    const address = (order.shippingAddress ?? {}) as Record<string, unknown>;
    const name = typeof address.firstName === "string" && address.firstName.trim()
      ? address.firstName.trim()
      : "there";

    return [
      `Hi ${name},`,
      "",
      `Thank you for shopping with HIDI. We hope you're loving ${this.products(order)}.`,
      "",
      "We'd really value your review. It helps us improve and helps other customers shop with confidence.",
      "",
      `Share your review: ${reviewUrl}`,
      "",
      "Thank you,",
      "HIDI",
    ].join("\n");
  }

  private htmlMessage(order: any, reviewUrl: string) {
    const address = (order.shippingAddress ?? {}) as Record<string, unknown>;
    const name = typeof address.firstName === "string" && address.firstName.trim()
      ? this.escape(address.firstName.trim())
      : "there";

    return `<!doctype html>
<html>
<body style="margin:0;background:#f6f1e8;color:#2c241f;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:auto;padding:38px 24px">
    <div style="font-family:Georgia,serif;font-size:30px;letter-spacing:.08em;margin-bottom:28px">HIDI</div>
    <div style="background:#fffdf8;border:1px solid #e1d8ca;padding:32px">
      <p style="margin-top:0">Hi ${name},</p>
      <p>Thank you for shopping with HIDI. We hope you're loving <strong>${this.escape(this.products(order))}</strong>.</p>
      <p>We'd really value your review. It helps us improve and helps other customers shop with confidence.</p>
      <p style="margin:28px 0">
        <a href="${this.escape(reviewUrl)}" style="display:inline-block;background:#33251f;color:#fff;text-decoration:none;padding:13px 20px">Share your review</a>
      </p>
      <p style="margin-bottom:0">Thank you,<br>HIDI</p>
    </div>
  </div>
</body>
</html>`;
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character] ?? character));
  }
}
