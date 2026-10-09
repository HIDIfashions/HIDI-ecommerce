import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createHmac, createVerify, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  phone?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type VerifiedAuthUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean;
  metadata: Record<string, unknown>;
  phone?: string | null;
  phoneVerified?: boolean;
};

type HidiAuthTokenPayload = {
  typ: "access" | "refresh";
  sub: string;
  uid: string;
  phone?: string | null;
  email?: string | null;
  sid?: string;
  iat: number;
  exp: number;
  jti: string;
};

type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string | null; phone?: string | null };
};

const ACCESS_PREFIX = "hidi_at_";
const REFRESH_PREFIX = "hidi_rt_";
const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let firebaseCertCache: { expiresAt: number; certs: Record<string, string> } | null = null;

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function secondsFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

function normalizeIndianPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new BadRequestException("Enter a valid 10-digit Indian mobile number");
  return `+91${local}`;
}

function normalizeOtp(value: unknown) {
  const code = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new BadRequestException("Enter the 6-digit OTP");
  return code;
}

function randomOtp() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

function jsonBody(value: unknown, fallback: string) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : (() => { throw new BadRequestException(fallback); })();
}

function tooManyRequests(message: string) {
  return new HttpException(message, 429);
}

function decodeJwtPart(part: string) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
  }
}

function cacheMaxAgeMillis(cacheControl: string | null) {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  const seconds = match ? Number(match[1]) : 3600;
  return Math.max(60, Math.min(Number.isFinite(seconds) ? seconds : 3600, 24 * 60 * 60)) * 1000;
}

@Injectable()
export class SupabaseAuthService {
  constructor(private readonly prisma?: PrismaService) {}

  async requireUser(authorization?: string): Promise<VerifiedAuthUser> {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Sign in is required");
    }

    const bearer = authorization.slice("Bearer ".length).trim();
    if (bearer.startsWith(ACCESS_PREFIX)) {
      return this.requireHidiUser(bearer);
    }

    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new ServiceUnavailableException("Customer authentication is not configured");
    }

    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: authorization,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }

    const user = await response.json() as SupabaseAuthUser;
    const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
    const email = user.email_confirmed_at && normalizedEmail ? normalizedEmail : null;
    const phone = user.phone_confirmed_at ? user.phone ?? null : null;

    if (!user.id || (!email && !phone)) {
      throw new UnauthorizedException("A verified mobile number or email address is required");
    }

    return {
      id: user.id,
      email,
      emailVerified: Boolean(email),
      metadata: user.user_metadata ?? {},
      phone,
      phoneVerified: Boolean(phone),
    };
  }

  private requirePrisma() {
    if (!this.prisma) throw new ServiceUnavailableException("Customer authentication is not configured");
    return this.prisma as any;
  }

  private signingSecret() {
    const configured = process.env.HIDI_AUTH_SECRET ?? process.env.AUTH_TOKEN_SECRET;
    if (configured && configured.length >= 32) return configured;
    if (process.env.HIDI_AUTH_DEV_OTP === "true" && process.env.NODE_ENV !== "production") {
      return "hidi-local-whatsapp-otp-development-secret-only";
    }
    throw new ServiceUnavailableException("Customer authentication is not configured");
  }

  private accessTtlSeconds() {
    const value = Number(process.env.HIDI_AUTH_ACCESS_TTL_SECONDS ?? "3600");
    return Number.isInteger(value) && value >= 300 && value <= 24 * 60 * 60 ? value : 3600;
  }

  private refreshTtlSeconds() {
    const value = Number(process.env.HIDI_AUTH_REFRESH_TTL_SECONDS ?? String(30 * 24 * 60 * 60));
    return Number.isInteger(value) && value >= 24 * 60 * 60 && value <= 90 * 24 * 60 * 60
      ? value
      : 30 * 24 * 60 * 60;
  }

  private sign(payload: HidiAuthTokenPayload) {
    const prefix = payload.typ === "access" ? ACCESS_PREFIX : REFRESH_PREFIX;
    const body = base64Url(JSON.stringify(payload));
    const signature = base64Url(createHmac("sha256", this.signingSecret()).update(body).digest());
    return `${prefix}${body}.${signature}`;
  }

  private verifySignedToken(token: string, typ: "access" | "refresh"): HidiAuthTokenPayload {
    const prefix = typ === "access" ? ACCESS_PREFIX : REFRESH_PREFIX;
    if (!token.startsWith(prefix)) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }
    const [body, signature] = token.slice(prefix.length).split(".");
    if (!body || !signature) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }
    const expected = base64Url(createHmac("sha256", this.signingSecret()).update(body).digest());
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }
    let payload: HidiAuthTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HidiAuthTokenPayload;
    } catch {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.typ !== typ || !payload.sub || !payload.uid || !payload.jti || payload.exp <= now) {
      throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    }
    return payload;
  }

  private hashValue(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private otpHash(phone: string, code: string) {
    return createHash("sha256").update(`${phone}:${code}:${this.signingSecret()}`).digest("hex");
  }

  private async requireHidiUser(token: string): Promise<VerifiedAuthUser> {
    const payload = this.verifySignedToken(token, "access");
    return {
      id: payload.sub,
      email: payload.email ?? null,
      emailVerified: Boolean(payload.email),
      phone: payload.phone ?? null,
      phoneVerified: Boolean(payload.phone),
      metadata: {
        auth_provider: "hidi_phone",
        hidi_user_id: payload.uid,
      },
    };
  }

  private customerOtpProvider() {
    const configured = (
      process.env.CUSTOMER_OTP_PROVIDER ??
      process.env.CUSTOMER_AUTH_PROVIDER ??
      process.env.HIDI_CUSTOMER_AUTH_PROVIDER ??
      ""
    ).trim().toLowerCase();
    if (configured && configured !== "hidi") return configured;
    if (process.env.MSG91_AUTHKEY && process.env.MSG91_SMS_OTP_TEMPLATE_ID) return "msg91";
    if (process.env.FIREBASE_PROJECT_ID) return "firebase";
    return "msg91";
  }

  private isMsg91SmsProvider(provider: string) {
    return ["msg91", "msg91-sms", "msg91_sms", "sms"].includes(provider);
  }

  private firebaseFallbackConfigured() {
    return process.env.CUSTOMER_OTP_FALLBACK_PROVIDER?.trim().toLowerCase() === "firebase" &&
      Boolean(process.env.FIREBASE_PROJECT_ID?.trim());
  }

  private firebaseOtpRequest(phone: string, fallback = false) {
    this.signingSecret();
    this.firebaseProjectId();
    return {
      phone, channel: "FIREBASE", provider: "firebase", clientHandled: true,
      ...(fallback ? { fallback: true } : {}),
    };
  }

  private firebaseProjectId() {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (projectId) return projectId;
    throw new ServiceUnavailableException("Firebase OTP is not configured");
  }

  private async firebaseCerts() {
    if (firebaseCertCache && firebaseCertCache.expiresAt > Date.now() + 30_000) return firebaseCertCache.certs;
    const response = await fetch(FIREBASE_CERTS_URL);
    if (!response.ok) throw new ServiceUnavailableException("Firebase OTP is not available right now");
    const certs = await response.json() as Record<string, string>;
    firebaseCertCache = {
      certs,
      expiresAt: Date.now() + cacheMaxAgeMillis(response.headers.get("cache-control")),
    };
    return certs;
  }

  private async verifyFirebaseIdToken(idToken: string) {
    if (!idToken || idToken.length > 8192) throw new UnauthorizedException("That code is invalid or has expired");
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("That code is invalid or has expired");
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJwtPart(headerPart);
    const payload = decodeJwtPart(payloadPart);
    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      throw new UnauthorizedException("That code is invalid or has expired");
    }
    const cert = (await this.firebaseCerts())[header.kid];
    if (!cert) throw new UnauthorizedException("That code is invalid or has expired");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerPart}.${payloadPart}`);
    verifier.end();
    if (!verifier.verify(cert, Buffer.from(signaturePart, "base64url"))) {
      throw new UnauthorizedException("That code is invalid or has expired");
    }

    const projectId = this.firebaseProjectId();
    const now = Math.floor(Date.now() / 1000);
    const issuer = `https://securetoken.google.com/${projectId}`;
    const firebase = payload.firebase && typeof payload.firebase === "object"
      ? payload.firebase as Record<string, unknown>
      : {};
    const provider = typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider : "";
    const phone = typeof payload.phone_number === "string" ? normalizeIndianPhone(payload.phone_number) : null;
    const tenantId = process.env.FIREBASE_TENANT_ID?.trim();

    if (
      payload.aud !== projectId ||
      payload.iss !== issuer ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.sub.length > 128 ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      payload.exp <= now ||
      payload.iat > now + 300 ||
      !phone ||
      (provider && provider !== "phone") ||
      (tenantId && firebase.tenant !== tenantId)
    ) {
      throw new UnauthorizedException("That code is invalid or has expired");
    }

    return { firebaseUid: payload.sub, phone };
  }

  private async verifyFirebasePhoneOtp(body: Record<string, unknown>): Promise<AuthSessionPayload> {
    this.signingSecret();
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    const { phone } = await this.verifyFirebaseIdToken(idToken);
    const prisma = this.requirePrisma();
    const user = await prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });
    return this.createSession(prisma, user);
  }

  private async authSubjectForUser(prisma: any, userId: string) {
    const [wallet, retention] = await Promise.all([
      prisma.walletAccount.findUnique({ where: { userId }, select: { authSubject: true } }),
      prisma.retentionProfile.findUnique({ where: { userId }, select: { authSubject: true } }),
    ]);
    return wallet?.authSubject ?? retention?.authSubject ?? userId;
  }

  private async createSession(prisma: any, user: { id: string; email?: string | null; phone?: string | null }, authSubject?: string): Promise<AuthSessionPayload> {
    const now = Math.floor(Date.now() / 1000);
    const accessTtl = this.accessTtlSeconds();
    const refreshTtl = this.refreshTtlSeconds();
    const subject = authSubject ?? await this.authSubjectForUser(prisma, user.id);
    const access = this.sign({
      typ: "access",
      sub: subject,
      uid: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      iat: now,
      exp: now + accessTtl,
      jti: randomUUID(),
    });
    const refreshSessionId = randomUUID();
    const refresh = this.sign({
      typ: "refresh",
      sub: subject,
      uid: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      sid: refreshSessionId,
      iat: now,
      exp: now + refreshTtl,
      jti: randomUUID(),
    });
    await prisma.customerAuthSession.create({
      data: {
        id: refreshSessionId,
        userId: user.id,
        authSubject: subject,
        tokenHash: this.hashValue(refresh),
        expiresAt: new Date((now + refreshTtl) * 1000),
      },
    });
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: accessTtl,
      user: { id: subject, email: user.email ?? null, phone: user.phone ?? null },
    };
  }

  private msg91SmsOtpConfigured() {
    if (process.env.HIDI_AUTH_DEV_OTP === "true" && process.env.NODE_ENV !== "production") return true;
    return Boolean(process.env.MSG91_AUTHKEY && process.env.MSG91_SMS_OTP_TEMPLATE_ID);
  }

  private async sendMsg91SmsOtp(phone: string, code: string) {
    if (process.env.HIDI_AUTH_DEV_OTP === "true" && process.env.NODE_ENV !== "production") return;
    const authkey = process.env.MSG91_AUTHKEY?.trim();
    const templateId = process.env.MSG91_SMS_OTP_TEMPLATE_ID?.trim();
    if (!authkey || !templateId) throw new ServiceUnavailableException("SMS OTP is not configured");

    let url: URL;
    try {
      url = new URL(process.env.MSG91_SMS_OTP_ENDPOINT?.trim() || "https://control.msg91.com/api/v5/otp");
      if (url.protocol !== "https:" || !["control.msg91.com", "api.msg91.com"].includes(url.hostname) ||
          (url.port && url.port !== "443") || url.username || url.password || url.search || url.hash ||
          !/^\/api\/v5\/otp\/?$/.test(url.pathname)) {
        throw new Error("Invalid endpoint");
      }
    } catch {
      throw new ServiceUnavailableException("SMS OTP endpoint is not configured correctly");
    }
    url.searchParams.set("template_id", templateId);
    url.searchParams.set("mobile", phone.replace(/\D/g, ""));
    url.searchParams.set("otp", code);
    url.searchParams.set("otp_length", String(code.length));
    url.searchParams.set("otp_expiry", String(Math.ceil(OTP_TTL_SECONDS / 60)));

    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          authkey,
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      const status = String(payload?.type ?? payload?.status ?? "").toLowerCase();
      if (!response.ok || status !== "success") throw new Error("SMS provider rejected request");
    } catch {
      // Provider responses and network errors may include the recipient, code
      // or credentials. Return a generic error and invalidate the challenge.
      throw new ServiceUnavailableException("Unable to send SMS OTP right now");
    }
  }

  private whatsappOtpProvider() {
    const provider = (process.env.WHATSAPP_OTP_PROVIDER ?? "").trim().toLowerCase();
    if (provider) return provider;
    if (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID) return "meta";
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) return "twilio";
    return "";
  }

  private whatsappOtpConfigured() {
    if (process.env.HIDI_AUTH_DEV_OTP === "true" && process.env.NODE_ENV !== "production") return true;
    const provider = this.whatsappOtpProvider();
    if (provider === "meta") {
      return Boolean(
        process.env.WHATSAPP_CLOUD_ACCESS_TOKEN &&
        process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_AUTH_TEMPLATE_NAME,
      );
    }
    if (provider === "twilio") {
      return Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM &&
        (process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID || process.env.TWILIO_WHATSAPP_BODY_OTP_ENABLED === "true"),
      );
    }
    return false;
  }

  private async sendMetaWhatsappOtp(phone: string, code: string) {
    const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_AUTH_TEMPLATE_NAME;
    if (!accessToken || !phoneNumberId || !templateName) {
      throw new ServiceUnavailableException("WhatsApp OTP is not configured");
    }
    const version = process.env.WHATSAPP_CLOUD_GRAPH_VERSION ?? "v21.0";
    const components: Array<Record<string, unknown>> = [
      { type: "body", parameters: [{ type: "text", text: code }] },
    ];
    if (process.env.WHATSAPP_AUTH_TEMPLATE_INCLUDE_BUTTON !== "false") {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: code }],
      });
    }
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE ?? "en_US" },
          components,
        },
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException("Unable to send WhatsApp OTP right now");
  }

  private async sendTwilioWhatsappOtp(phone: string, code: string) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken || !from) throw new ServiceUnavailableException("WhatsApp OTP is not configured");
    const body = new URLSearchParams({
      From: `whatsapp:${from}`,
      To: `whatsapp:${phone}`,
    });
    const contentSid = process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID;
    if (contentSid) {
      body.set("ContentSid", contentSid);
      body.set("ContentVariables", JSON.stringify({ "1": code }));
    } else if (process.env.TWILIO_WHATSAPP_BODY_OTP_ENABLED === "true") {
      body.set("Body", `Your HIDI sign-in code is ${code}. It expires in 5 minutes.`);
    } else {
      throw new ServiceUnavailableException("WhatsApp OTP template is not configured");
    }
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) throw new ServiceUnavailableException("Unable to send WhatsApp OTP right now");
  }

  private async sendWhatsappOtp(phone: string, code: string) {
    if (process.env.HIDI_AUTH_DEV_OTP === "true" && process.env.NODE_ENV !== "production") return;
    const provider = this.whatsappOtpProvider();
    if (provider === "meta") return this.sendMetaWhatsappOtp(phone, code);
    if (provider === "twilio") return this.sendTwilioWhatsappOtp(phone, code);
    throw new ServiceUnavailableException("WhatsApp OTP is not configured");
  }

  authConfig() {
    let configured = false;
    const provider = this.customerOtpProvider();
    try {
      this.signingSecret();
      if (provider === "firebase") {
        this.firebaseProjectId();
        configured = true;
      } else if (this.isMsg91SmsProvider(provider)) {
        configured = this.msg91SmsOtpConfigured() || this.firebaseFallbackConfigured();
      } else if (!provider || provider === "whatsapp") {
        configured = this.whatsappOtpConfigured();
      }
    } catch {
      configured = false;
    }
    const smsProvider = this.isMsg91SmsProvider(provider);
    return {
      phoneOtp: configured,
      channel: provider === "firebase" ? "FIREBASE" : smsProvider ? "SMS" : "WHATSAPP",
      provider: provider === "firebase" ? "firebase" : smsProvider ? "msg91" : "whatsapp",
      ...(configured && smsProvider && this.firebaseFallbackConfigured() ? { fallbackProvider: "firebase" } : {}),
    };
  }

  async requestPhoneOtp(input: unknown) {
    const body = jsonBody(input, "Invalid OTP request");
    const phone = normalizeIndianPhone(body.phone);
    const provider = this.customerOtpProvider();
    if (provider === "firebase") {
      return this.firebaseOtpRequest(phone);
    }
    const smsProvider = this.isMsg91SmsProvider(provider);
    if (smsProvider) {
      this.signingSecret();
      if (!this.msg91SmsOtpConfigured()) {
        if (this.firebaseFallbackConfigured()) return this.firebaseOtpRequest(phone, true);
        throw new ServiceUnavailableException("SMS OTP is not configured");
      }
      const prisma = this.requirePrisma();

      const recent = await prisma.customerAuthOtp.count({
        where: {
          phone,
          purpose: "SIGN_IN",
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (recent >= 5) throw tooManyRequests("Please wait before requesting another OTP");

      const code = randomOtp();
      const challenge = await prisma.customerAuthOtp.create({
        data: {
          phone,
          codeHash: this.otpHash(phone, code),
          purpose: "SIGN_IN",
          channel: "SMS",
          expiresAt: secondsFromNow(OTP_TTL_SECONDS),
        },
      });

      try {
        await this.sendMsg91SmsOtp(phone, code);
      } catch (error) {
        // Finish invalidation before switching proof types. A database failure
        // must not leave a potentially delivered SMS valid alongside fallback.
        await prisma.customerAuthOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
          .catch(() => { throw new ServiceUnavailableException("Unable to send SMS OTP right now"); });
        if (error instanceof ServiceUnavailableException && this.firebaseFallbackConfigured()) {
          return this.firebaseOtpRequest(phone, true);
        }
        throw error;
      }

      return {
        phone,
        channel: "SMS",
        expiresInSeconds: OTP_TTL_SECONDS,
        ...(process.env.HIDI_AUTH_DEV_OTP_RESPONSE === "true" && process.env.NODE_ENV !== "production" ? { devOtp: code } : {}),
      };
    }
    if (provider && provider !== "whatsapp") {
      throw new ServiceUnavailableException("Customer OTP provider is not supported");
    }
    const prisma = this.requirePrisma();
    this.signingSecret();
    if (!this.whatsappOtpConfigured()) throw new ServiceUnavailableException("WhatsApp OTP is not configured");

    const recent = await prisma.customerAuthOtp.count({
      where: {
        phone,
        purpose: "SIGN_IN",
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recent >= 5) throw tooManyRequests("Please wait before requesting another OTP");

    const code = randomOtp();
    const challenge = await prisma.customerAuthOtp.create({
      data: {
        phone,
        codeHash: this.otpHash(phone, code),
        purpose: "SIGN_IN",
        channel: "WHATSAPP",
        expiresAt: secondsFromNow(OTP_TTL_SECONDS),
      },
    });

    try {
      await this.sendWhatsappOtp(phone, code);
    } catch (error) {
      await prisma.customerAuthOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }).catch(() => undefined);
      throw error;
    }

    return {
      phone,
      channel: "WHATSAPP",
      expiresInSeconds: OTP_TTL_SECONDS,
      ...(process.env.HIDI_AUTH_DEV_OTP_RESPONSE === "true" && process.env.NODE_ENV !== "production" ? { devOtp: code } : {}),
    };
  }

  async verifyPhoneOtp(input: unknown): Promise<AuthSessionPayload> {
    const body = jsonBody(input, "Invalid OTP verification request");
    const requestedProvider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
    // Verify the proof that was issued, even if the delivery provider changed meanwhile.
    if (requestedProvider === "firebase" || typeof body.idToken === "string") {
      return this.verifyFirebasePhoneOtp(body);
    }
    const phone = normalizeIndianPhone(body.phone);
    const code = normalizeOtp(body.otp ?? body.token);
    const prisma = this.requirePrisma();
    const challenge = await prisma.customerAuthOtp.findFirst({
      where: {
        phone,
        purpose: "SIGN_IN",
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new UnauthorizedException("That code is invalid or has expired");
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw tooManyRequests("Please request a new OTP");

    const expected = this.otpHash(phone, code);
    if (!safeEqual(expected, challenge.codeHash)) {
      await prisma.customerAuthOtp.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("That code is invalid or has expired");
    }

    const user = await prisma.$transaction(async (tx: any) => {
      const consumed = await tx.customerAuthOtp.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException("That code is invalid or has expired");
      return tx.user.upsert({
        where: { phone },
        create: { phone },
        update: {},
      });
    });
    return this.createSession(prisma, user);
  }

  async refresh(input: unknown): Promise<AuthSessionPayload> {
    const body = jsonBody(input, "Invalid refresh request");
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    const payload = this.verifySignedToken(refreshToken, "refresh");
    if (!payload.sid) throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    const prisma = this.requirePrisma();
    const tokenHash = this.hashValue(refreshToken);
    const session = await prisma.customerAuthSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.uid,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException("Your sign-in session has expired. Please sign in again.");
    await prisma.customerAuthSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    return this.createSession(prisma, user, session.authSubject);
  }

  async logout(input: unknown) {
    const prisma = this.prisma as any;
    if (!prisma) return { signedOut: true };
    const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    if (refreshToken.startsWith(REFRESH_PREFIX)) {
      const tokenHash = this.hashValue(refreshToken);
      await prisma.customerAuthSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
    }
    return { signedOut: true };
  }

  async optionalUser(authorization?: string): Promise<VerifiedAuthUser | null> {
    if (!authorization?.startsWith("Bearer ")) return null;
    return this.requireUser(authorization);
  }
}
