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

    const id = randomUUID();
    const sql = `
      INSERT INTO "NewsletterSubscriber" (
        "id", "email", "status", "source", "consentVersion", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'ACTIVE', $3, 'hidi-newsletter-v1', NOW(), NOW())
      ON CONFLICT ("email") DO UPDATE
      SET "status" = 'ACTIVE',
          "source" = EXCLUDED."source",
          "consentVersion" = EXCLUDED."consentVersion",
          "updatedAt" = NOW()
      RETURNING "email", (xmax = 0) AS "created"
    `;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ email: string; created: boolean }>>(sql, id, email, source);

    return {
      ok: true,
      email: rows[0]?.email ?? email,
      message: rows[0]?.created
        ? "You’re in. HIDI updates and rewards news are on the way."
        : "You’re already subscribed to HIDI updates.",
    };
  }
}
