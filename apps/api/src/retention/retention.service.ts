import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { DAY_MS, EPISODE_GAP_MS, EVENT_RETENTION_DAYS, previewRetention, RETENTION_CONSENT_VERSION } from "./retention-policy.js";

function verifiedPhone(auth: VerifiedAuthUser): string | null {
  if (!auth.phoneVerified || !auth.phone) return null;
  const phone = auth.phone.startsWith("+") ? auth.phone : `+${auth.phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

function objectBody(value: unknown, allowedKeys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Invalid request body");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) throw new BadRequestException("Unexpected request field");
  return body;
}

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  private enabled() { return process.env.RETENTION_ENABLED === "true"; }

  async preferences(auth: VerifiedAuthUser) {
    const profile = await this.prisma.retentionProfile.findUnique({ where: { authSubject: auth.id } });
    const phone = verifiedPhone(auth);
    const sameVerifiedPhone = Boolean(phone && phone === profile?.verifiedPhone);
    return {
      enabled: this.enabled(),
      sendingEnabled: false as const,
      consentVersion: RETENTION_CONSENT_VERSION,
      whatsappOptIn: Boolean(profile?.whatsappOptIn && sameVerifiedPhone && profile.consentVersion === RETENTION_CONSENT_VERSION),
      personalizationOptIn: profile?.personalizationOptIn ?? false,
      phoneVerified: Boolean(phone),
      maskedPhone: phone ? `•••• ${phone.slice(-4)}` : null,
    };
  }

  async savePreferences(auth: VerifiedAuthUser, input: unknown) {
    const body = objectBody(input, ["consentVersion", "whatsappOptIn", "personalizationOptIn"]);
    if (typeof body.whatsappOptIn !== "boolean" || typeof body.personalizationOptIn !== "boolean") throw new BadRequestException("Choose both communication preferences");
    const whatsappOptIn = body.whatsappOptIn;
    const personalizationOptIn = body.personalizationOptIn;
    const phone = verifiedPhone(auth);
    if (whatsappOptIn && !phone) throw new BadRequestException("Verify your phone number before enabling WhatsApp marketing");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.retentionProfile.findUnique({ where: { authSubject: auth.id } });
      // A stale UI may revoke either permission independently. It cannot grant a
      // new permission or silently reconfirm the permission left unchanged.
      const currentWording = body.consentVersion === RETENTION_CONSENT_VERSION;
      if (!currentWording && ((whatsappOptIn && (!existing?.whatsappOptIn || existing.verifiedPhone !== phone)) || (personalizationOptIn && !existing?.personalizationOptIn))) {
        throw new BadRequestException("Please review the current consent wording");
      }
      const consentVersion = currentWording ? RETENTION_CONSENT_VERSION : (existing?.consentVersion ?? RETENTION_CONSENT_VERSION);
      let userId = existing?.userId;
      if (!userId) {
        // Email has been verified against Supabase Auth, never supplied in this body.
        const user = await tx.user.upsert({ where: { email: auth.email }, create: { email: auth.email }, update: {} });
        const prior = await tx.retentionProfile.findUnique({ where: { userId: user.id } });
        if (prior && prior.authSubject !== auth.id) throw new ConflictException("This customer account requires a support review before linking preferences");
        userId = user.id;
      }
      const values = {
        whatsappOptIn, personalizationOptIn, consentVersion,
        verifiedPhone: phone, phoneVerifiedAt: phone ? now : null, consentUpdatedAt: now,
      };
      const profile = await tx.retentionProfile.upsert({
        where: { authSubject: auth.id },
        create: { authSubject: auth.id, userId, ...values },
        update: values,
      });
      await tx.retentionConsentAudit.create({ data: {
        profileId: profile.id, whatsappOptIn, personalizationOptIn,
        consentVersion, source: "account_preferences", verifiedPhone: phone,
      } });
      if (!personalizationOptIn) await tx.retentionEvent.deleteMany({ where: { profileId: profile.id } });
      if (!whatsappOptIn || !personalizationOptIn) {
        await tx.retentionDelivery.updateMany({
          where: { profileId: profile.id, status: { in: ["QUEUED", "PENDING"] } },
          data: { status: "CANCELLED" },
        });
      }
    });
    return this.preferences(auth);
  }

  async track(auth: VerifiedAuthUser, input: unknown) {
    if (!this.enabled()) return { recorded: false, reason: "FEATURE_DISABLED" };
    const body = objectBody(input, ["productId", "variantId", "kind"]);
    if (typeof body.productId !== "string" || !body.productId || body.productId.length > 128) throw new BadRequestException("A valid product is required");
    if (body.kind !== "DETAIL_VIEW" && body.kind !== "SIZE_SELECT") throw new BadRequestException("Unsupported product interaction");
    if (body.variantId !== undefined && (typeof body.variantId !== "string" || !body.variantId || body.variantId.length > 128)) throw new BadRequestException("Invalid selected variant");
    const productId = body.productId;
    const variantId = typeof body.variantId === "string" ? body.variantId : null;
    const kind = body.kind;
    if (kind === "SIZE_SELECT" && !variantId) throw new BadRequestException("A selected size variant is required");
    const profile = await this.prisma.retentionProfile.findUnique({ where: { authSubject: auth.id } });
    if (!profile?.personalizationOptIn) return { recorded: false, reason: "NO_PERSONALIZATION_CONSENT" };
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: { id: true, variants: { where: { active: true }, select: { id: true } } },
    });
    if (!product || (variantId && !product.variants.some((variant) => variant.id === variantId))) throw new NotFoundException("Product or size is not available");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Row lock serializes tracking against preference withdrawal and duplicate events.
      const lock = await tx.retentionProfile.updateMany({
        where: { id: profile.id, authSubject: auth.id, personalizationOptIn: true, consentVersion: RETENTION_CONSENT_VERSION },
        data: { updatedAt: now },
      });
      if (!lock.count) return { recorded: false, reason: "NO_PERSONALIZATION_CONSENT" };
      const phone = verifiedPhone(auth);
      if (profile.whatsappOptIn && phone !== profile.verifiedPhone) {
        await tx.retentionProfile.update({ where: { id: profile.id }, data: { whatsappOptIn: false, verifiedPhone: phone, phoneVerifiedAt: phone ? now : null } });
        await tx.retentionConsentAudit.create({ data: { profileId: profile.id, whatsappOptIn: false, personalizationOptIn: true, consentVersion: RETENTION_CONSENT_VERSION, source: "verified_phone_changed", verifiedPhone: phone } });
        await tx.retentionDelivery.updateMany({ where: { profileId: profile.id, status: { in: ["QUEUED", "PENDING"] } }, data: { status: "CANCELLED" } });
      }
      const duplicate = await tx.retentionEvent.findFirst({ where: { profileId: profile.id, productId, variantId, kind, createdAt: { gte: new Date(now.getTime() - 5 * 60_000) } } });
      if (duplicate) return { recorded: false, reason: "DUPLICATE_INTERACTION" };
      const todayCount = await tx.retentionEvent.count({ where: { profileId: profile.id, createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });
      if (todayCount >= 120) return { recorded: false, reason: "DAILY_EVENT_LIMIT" };
      const last = await tx.retentionEvent.findFirst({ where: { profileId: profile.id, productId }, orderBy: { createdAt: "desc" } });
      const episodeKey = last && now.getTime() - last.createdAt.getTime() <= EPISODE_GAP_MS ? last.episodeKey : randomUUID();
      await tx.retentionEvent.create({ data: { profileId: profile.id, productId, variantId, kind, episodeKey, createdAt: now } });
      // Local bounded cleanup; a global purge worker is required before live activation.
      await tx.retentionEvent.deleteMany({ where: { profileId: profile.id, createdAt: { lt: new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS) } } });
      return { recorded: true };
    });
  }

  async adminPreview(after?: string) {
    if (after && (after.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(after))) throw new BadRequestException("Invalid preview cursor");
    const now = new Date();
    const meta = {
      enabled: this.enabled(), sendingEnabled: false as const, mode: "DRY_RUN_ONLY",
      evaluatedAt: now, scope: "Authenticated, consenting customers and owned carts only",
      activationRequirements: ["Verified-phone enrollment", "Approved Meta marketing templates", "STOP webhook and human handoff", "Atomic delivery queue and cross-campaign ledger", "Send-time consent, stock, price and purchase recheck", "Secure checkout identity for orders using a different or missing account email", "Global activity purge and privacy review", "Secure guest-cart account linking"],
    };
    if (!this.enabled()) return { ...meta, candidates: [], nextCursor: null };
    const profiles = await this.prisma.retentionProfile.findMany({
      where: after ? { id: { gt: after } } : {}, orderBy: { id: "asc" }, take: 26,
      include: {
        events: { where: { createdAt: { gte: new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS) } }, orderBy: { createdAt: "desc" }, take: 501 },
        // Keep episode dedupe even for an old send followed by continued browsing.
        deliveries: { where: { status: { in: ["SENT", "QUEUED", "SENDING"] } }, take: 1001 },
        user: { include: {
          carts: { where: { items: { some: {} } }, orderBy: { updatedAt: "desc" }, take: 11, include: { items: { take: 101, orderBy: { id: "asc" } } } },
        } },
      },
    });
    const page = profiles.slice(0, 25);
    // Only a purchase timestamp is required to suppress recovery. Include
    // unclaimed orders with the account email established by verified Auth,
    // because checkout does not currently link every order to User.id. Never
    // claim/mutate the order or accept a browser-supplied email as identity.
    // Latest-only lookup is sufficient: any later purchase cancels recovery.
    const latestPurchases = await Promise.all(page.map((profile) => this.prisma.order.findFirst({
      where: {
        OR: [
          { userId: profile.userId },
          ...(profile.user.email ? [{ userId: null, customerEmail: { equals: profile.user.email, mode: "insensitive" as const } }] : []),
        ],
        status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] },
        createdAt: { gte: new Date(now.getTime() - (EVENT_RETENTION_DAYS + 7) * DAY_MS) },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    })));
    const productIds = [...new Set(page.flatMap((profile) => [...profile.events.map((event) => event.productId), ...profile.user.carts.flatMap((cart) => cart.items.map((item) => item.productId))]))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, include: { variants: { include: { inventory: true } } } });
    const catalog = products.map((product) => ({
      id: product.id, name: product.name, slug: product.slug, active: product.status === "ACTIVE",
      variants: product.variants.map((variant) => ({
        id: variant.id, active: variant.active, pricePaise: variant.pricePaise,
        available: variant.inventory ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock) : 0,
      })),
    }));
    const candidates = page.map((profile, index) => ({
      profileId: profile.id,
      ...(profile.events.length > 500 || profile.deliveries.length > 1000 || profile.user.carts.length > 10 || profile.user.carts.some((cart) => cart.items.length > 100) ? { sendingEnabled: false, eligibleForFutureSend: false, reason: "ACTIVITY_LIMIT_REVIEW_REQUIRED", candidate: null } : previewRetention({
        profileId: profile.id, enabled: true, whatsappOptIn: profile.whatsappOptIn, personalizationOptIn: profile.personalizationOptIn,
        consentVersion: profile.consentVersion, phoneVerified: Boolean(profile.verifiedPhone && profile.phoneVerifiedAt), now,
        events: profile.events.filter((event) => event.createdAt >= profile.consentUpdatedAt), products: catalog,
        carts: profile.user.carts.filter((cart) => Math.max(cart.updatedAt.getTime(), ...cart.items.map((item) => item.updatedAt.getTime())) >= profile.consentUpdatedAt.getTime()),
        purchases: latestPurchases[index] ? [latestPurchases[index]!] : [], deliveries: profile.deliveries,
      })),
    }));
    return { ...meta, candidates, nextCursor: profiles.length > 25 ? page[page.length - 1].id : null };
  }
}
