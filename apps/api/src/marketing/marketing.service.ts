import { withSerializableRetry } from "../wallet/wallet-transaction.js";
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribeNewsletter(body: { email?: unknown; source?: unknown }) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const source = typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 80)
      : "FOOTER";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException("Enter a valid email address.");
    }

    const result = await withSerializableRetry(this.prisma, async (tx) => {
      const existing = await tx.newsletterSubscriber.findUnique({ where: { email } });
      await tx.newsletterSubscriber.upsert({
        where: { email },
        create: { id: randomUUID(), email, source, status: "ACTIVE", consentVersion: "hidi-newsletter-v1" },
        update: { source, status: "ACTIVE", consentVersion: "hidi-newsletter-v1" },
      });
      return { email, created: !existing };
    });

    return {
      ok: true,
      email: result.email,
      message: result.created
        ? "You’re in. HIDI updates and rewards news are on the way."
        : "You’re already subscribed to HIDI updates.",
    };
  }
}

