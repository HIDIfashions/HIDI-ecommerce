import { BadRequestException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import { withSerializableRetry } from "../wallet/wallet-transaction.js";
import { Msg91CheckoutOtpProvider } from "./msg91-checkout-otp.provider.js";
import { checkoutPhone, checkoutSession, OTP_TTL_MS, GRANT_TTL_MS, RESEND_DELAY_MS, MAX_OTP_ATTEMPTS } from "./checkout-phone-policy.js";

type PhoneRequest = { sessionId?: unknown; phone?: unknown; challengeId?: unknown; otp?: unknown };
type CheckoutRequest = { sessionId?: unknown; customerPhone?: unknown; phoneVerificationToken?: unknown; checkoutToken?: unknown; shippingAddress?: { phone?: unknown } };
export type CheckoutPhoneGrant = { id: string; grantHash: string; sessionHash: string; phoneHash: string; actorHash: string };
const INVALID = "That code is invalid or has expired. Request a new code if needed.";
const REQUIRED = "Verify your mobile number before continuing to payment.";

@Injectable()
export class CheckoutPhoneService {
  constructor(private readonly prisma: PrismaService, private readonly provider: Msg91CheckoutOtpProvider) {}

  required() { return process.env.CHECKOUT_PHONE_VERIFICATION_REQUIRED === "true"; }

  policy() {
    return { required: this.required(), available: this.required() && this.configured(), otpLength: 6, expiresInSeconds: 300, resendAfterSeconds: 60 };
  }

  private configured() {
    return (process.env.CHECKOUT_PHONE_HASH_KEY?.length ?? 0) >= 32 && this.provider.configured();
  }

  private ready() {
    if (!this.required() || !this.configured()) {
      throw new ServiceUnavailableException("Mobile verification is temporarily unavailable. Please try again later.");
    }
  }

  private hash(kind: string, value: string) {
    const secret = process.env.CHECKOUT_PHONE_HASH_KEY;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("Mobile verification is temporarily unavailable.");
    return createHmac("sha256", secret).update(JSON.stringify([kind, value])).digest("hex");
  }

  private binding(input: PhoneRequest, auth: VerifiedAuthUser | null) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("Mobile verification details are required");
    const sessionId = checkoutSession(input.sessionId);
    const phone = checkoutPhone(input.phone);
    return { sessionId, phone, sessionHash: this.hash("session", sessionId), phoneHash: this.hash("phone", phone), actorHash: this.hash("actor", auth?.id ?? "guest") };
  }

  private sameHash(actual: string | null, expected: string) {
    return typeof actual === "string" && /^[0-9a-f]{64}$/.test(actual)
      && timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }

  private async takeSendBudget(tx: Prisma.TransactionClient, sessionHash: string, phoneHash: string, now: Date) {
    const rawLimit = Number(process.env.CHECKOUT_OTP_HOURLY_SEND_LIMIT ?? 100);
    const globalLimit = Number.isSafeInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 1000 ? rawLimit : 100;
    // Durable, serializable counters; do not trust caller-supplied proxy/IP headers.
    // Global first gives all replicas the same lock ordering and a bounded SMS spend ceiling.
    const buckets = [
      { key: this.hash("rate", "global"), limit: globalLimit, cooldown: 0 },
      { key: this.hash("rate-phone", phoneHash), limit: 5, cooldown: RESEND_DELAY_MS },
      { key: this.hash("rate-session", sessionHash), limit: 5, cooldown: RESEND_DELAY_MS },
    ];
    for (const bucket of buckets) {
      const row = await tx.checkoutPhoneRate.findUnique({ where: { id: bucket.key } });
      const sameWindow = row && now.getTime() - row.windowStartedAt.getTime() < 3_600_000;
      const count = sameWindow ? row.count : 0;
      const tooSoon = row && now.getTime() - row.lastSentAt.getTime() < bucket.cooldown;
      if (tooSoon || count >= bucket.limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((tooSoon
          ? row!.lastSentAt.getTime() + bucket.cooldown - now.getTime()
          : row!.windowStartedAt.getTime() + 3_600_000 - now.getTime()) / 1000));
        throw new HttpException({ message: "Too many code requests. Please wait before trying again.", code: "OTP_RATE_LIMITED", retryAfterSeconds }, 429);
      }
      await tx.checkoutPhoneRate.upsert({
        where: { id: bucket.key },
        create: { id: bucket.key, count: 1, windowStartedAt: now, lastSentAt: now },
        update: { count: count + 1, windowStartedAt: sameWindow ? row!.windowStartedAt : now, lastSentAt: now },
      });
    }
  }

  async send(input: PhoneRequest, auth: VerifiedAuthUser | null = null) {
    this.ready();
    const b = this.binding(input, auth);
    // OTP endpoint cannot be used without an existing nonempty checkout bag.
    const cart = await this.prisma.cart.findUnique({ where: { sessionId: b.sessionId }, select: { items: { take: 1, select: { id: true } } } });
    if (!cart?.items.length) throw new BadRequestException("Add an item to your bag before verifying your mobile number.");
    const now = new Date();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    await withSerializableRetry(this.prisma, async tx => {
      await this.takeSendBudget(tx, b.sessionHash, b.phoneHash, now);
      // MSG91 Verify addresses OTPs by phone, not by request ID. Only the latest
      // challenge for a phone may succeed, even when another browser resends.
      await tx.checkoutPhoneChallenge.updateMany({
        where: { OR: [{ phoneHash: b.phoneHash }, { sessionHash: b.sessionHash, actorHash: b.actorHash }], status: { in: ["SENDING", "SENT", "VERIFYING", "VERIFIED"] } },
        data: { status: "INVALIDATED", grantHash: null },
      });
      await tx.checkoutPhoneChallenge.create({ data: { id, sessionHash: b.sessionHash, phoneHash: b.phoneHash, actorHash: b.actorHash, status: "SENDING", expiresAt } });
    });
    try {
      await this.provider.send(b.phone);
      const updated = await this.prisma.checkoutPhoneChallenge.updateMany({ where: { id, status: "SENDING", expiresAt: { gt: new Date() } }, data: { status: "SENT" } });
      if (updated.count !== 1) throw new Error("Challenge superseded");
    } catch {
      await this.prisma.checkoutPhoneChallenge.updateMany({ where: { id, status: "SENDING" }, data: { status: "FAILED" } }).catch(() => undefined);
      throw new ServiceUnavailableException("We could not send the verification code. Please wait a minute and try again.");
    }
    return { challengeId: id, maskedPhone: `+91 ••••••${b.phone.slice(-4)}`, expiresAt: expiresAt.toISOString(), resendAt: new Date(now.getTime() + RESEND_DELAY_MS).toISOString() };
  }

  async verify(input: PhoneRequest, auth: VerifiedAuthUser | null = null) {
    this.ready();
    const b = this.binding(input, auth);
    if (typeof input.challengeId !== "string" || !/^[0-9a-f-]{36}$/.test(input.challengeId)
      || typeof input.otp !== "string" || !/^[0-9]{6}$/.test(input.otp)) throw new BadRequestException(INVALID);
    const id = input.challengeId;
    const where = { id, sessionHash: b.sessionHash, phoneHash: b.phoneHash, actorHash: b.actorHash };
    // Atomically claim a single attempt before provider I/O. No parallel guesses.
    const claim = await this.prisma.checkoutPhoneChallenge.updateMany({
      where: { ...where, status: "SENT", attempts: { lt: MAX_OTP_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { status: "VERIFYING", attempts: { increment: 1 } },
    });
    if (claim.count !== 1) throw new BadRequestException(INVALID);
    let valid: boolean;
    try {
      valid = await this.provider.verify(b.phone, input.otp);
    } catch {
      // Ambiguous provider outcome: invalidate, never infer success or retry a consumed code.
      await this.prisma.checkoutPhoneChallenge.updateMany({ where: { ...where, status: "VERIFYING" }, data: { status: "FAILED" } }).catch(() => undefined);
      throw new ServiceUnavailableException("We could not verify the code. Please request a new code after the countdown.");
    }
    if (!valid) {
      await this.prisma.checkoutPhoneChallenge.updateMany({ where: { ...where, status: "VERIFYING" }, data: { status: "SENT" } });
      throw new BadRequestException(INVALID);
    }
    const token = `${id}.${randomBytes(32).toString("base64url")}`;
    const grantExpiresAt = new Date(Date.now() + GRANT_TTL_MS);
    const finish = await this.prisma.checkoutPhoneChallenge.updateMany({
      where: { ...where, status: "VERIFYING", expiresAt: { gt: new Date() } },
      data: { status: "VERIFIED", grantHash: this.hash("grant", token), grantExpiresAt },
    });
    if (finish.count !== 1) throw new BadRequestException(INVALID);
    return { verified: true, phone: b.phone, token, expiresAt: grantExpiresAt.toISOString() };
  }

  /** Called before order lookup, wallet/user writes, inventory or Razorpay. */
  async authorize(input: CheckoutRequest, auth: VerifiedAuthUser | null): Promise<CheckoutPhoneGrant | null> {
    if (!this.required()) return null; // Explicit rollout switch only; outages never disable an enabled gate.
    const phone = checkoutPhone(input.customerPhone);
    if (phone !== checkoutPhone(input.shippingAddress?.phone)) throw new BadRequestException("Use the same verified mobile number for contact and delivery.");
    if (auth?.phoneVerified && auth.phone) {
      if (checkoutPhone(auth.phone) !== phone) throw new UnauthorizedException("Use your verified sign-in mobile number for checkout.");
      return null;
    }
    this.ready();
    const b = this.binding({ sessionId: input.sessionId, phone }, auth);
    const token = input.phoneVerificationToken;
    if (typeof token !== "string" || !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException(REQUIRED);
    const id = token.split(".")[0];
    const row = await this.prisma.checkoutPhoneChallenge.findUnique({ where: { id } });
    const grantHash = this.hash("grant", token);
    const checkoutTokenHash = typeof input.checkoutToken === "string" ? this.hash("checkout", input.checkoutToken) : "";
    if (!row || !["VERIFIED", "USED"].includes(row.status) || !row.grantExpiresAt || row.grantExpiresAt.getTime() <= Date.now()
      || row.sessionHash !== b.sessionHash || row.phoneHash !== b.phoneHash || row.actorHash !== b.actorHash
      || !this.sameHash(row.grantHash, grantHash) || (row.checkoutTokenHash && row.checkoutTokenHash !== checkoutTokenHash)) {
      throw new UnauthorizedException(REQUIRED);
    }
    return { id, grantHash, sessionHash: b.sessionHash, phoneHash: b.phoneHash, actorHash: b.actorHash };
  }

  /** Claim the grant in the SAME transaction as order/stock creation. Rollback restores it. */
  async consume(tx: Prisma.TransactionClient, grant: CheckoutPhoneGrant | null, checkoutToken: string) {
    if (!grant) return;
    const checkoutTokenHash = this.hash("checkout", checkoutToken);
    const changed = await tx.checkoutPhoneChallenge.updateMany({
      where: { ...grant, status: { in: ["VERIFIED", "USED"] }, grantExpiresAt: { gt: new Date() }, OR: [{ checkoutTokenHash: null }, { checkoutTokenHash }] },
      data: { status: "USED", checkoutTokenHash },
    });
    if (changed.count !== 1) throw new UnauthorizedException(REQUIRED);
  }
}
