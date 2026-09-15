import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

@Injectable()
export class RazorpayService {
  private get keyId() {
    return process.env.RAZORPAY_KEY_ID ?? "";
  }
  private get keySecret() {
    return process.env.RAZORPAY_KEY_SECRET ?? "";
  }

  publicKey() {
    if (!this.keyId) throw new ServiceUnavailableException("Razorpay is not configured");
    return this.keyId;
  }

  async createOrder(input: { amountPaise: number; receipt: string; hidiOrderId: string }) {
    if (!this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException("Razorpay credentials are not configured");
    }
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt.slice(0, 40),
        notes: { hidi_order_id: input.hidiOrderId },
      }),
    });
    const data = await response.json() as any;
    if (!response.ok || !data?.id) {
      throw new ServiceUnavailableException(data?.error?.description ?? "Unable to create Razorpay order");
    }
    return data as { id: string; amount: number; currency: string; status: string };
  }

  async fetchPayment(paymentId: string) {
    if (!this.keyId || !this.keySecret) {
      throw new ServiceUnavailableException("Razorpay credentials are not configured");
    }
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await response.json() as any;
    if (!response.ok) {
      throw new ServiceUnavailableException(data?.error?.description ?? "Unable to verify Razorpay payment");
    }
    return data as { id: string; order_id: string; amount: number; currency: string; status: string; method?: string };
  }

  verifyCheckoutSignature(providerOrderId: string, paymentId: string, signature: string) {
    if (!this.keySecret) throw new ServiceUnavailableException("Razorpay is not configured");
    const expected = createHmac("sha256", this.keySecret)
      .update(`${providerOrderId}|${paymentId}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
    if (!secret) throw new ServiceUnavailableException("Razorpay webhook secret is not configured");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
