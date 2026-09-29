import { Injectable, ServiceUnavailableException } from "@nestjs/common";

/** Delivery/verification only. Does not create a HIDI or Supabase account.
 * Contract: https://docs.msg91.com/otp/sendotp and /otp/verify-otp.
 * Must be acceptance-tested with the approved OTP template before activation.
 */
@Injectable()
export class Msg91CheckoutOtpProvider {
  configured() {
    return Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_OTP_TEMPLATE_ID?.trim());
  }

  private async call(url: URL, method: "GET" | "POST") {
    if (!this.configured()) throw new ServiceUnavailableException("Mobile verification is temporarily unavailable. Please try again later.");
    try {
      const response = await fetch(url, {
        method,
        headers: { authkey: process.env.MSG91_AUTH_KEY!.trim(), Accept: "application/json" },
        signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error",
      });
      const data = await response.json() as { type?: unknown; message?: unknown; request_id?: unknown };
      if (!response.ok) throw new Error("Provider unavailable");
      return data;
    } catch {
      // Never return/log provider URLs (phone/OTP query parameters), credentials or response bodies.
      throw new ServiceUnavailableException("Mobile verification is temporarily unavailable. Please try again later.");
    }
  }

  async send(phone: string): Promise<void> {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", process.env.MSG91_OTP_TEMPLATE_ID?.trim() ?? "");
    url.searchParams.set("mobile", phone.replace(/^\+/, ""));
    url.searchParams.set("otp_length", "6");
    url.searchParams.set("otp_expiry", "5");
    const data = await this.call(url, "POST");
    if (data.type !== "success") throw new ServiceUnavailableException("We could not send the verification code. Please try again later.");
    // Provider acceptance is not proof of handset delivery, and never marks the number verified.
  }

  async verify(phone: string, otp: string): Promise<boolean> {
    const url = new URL("https://control.msg91.com/api/v5/otp/verify");
    url.searchParams.set("mobile", phone.replace(/^\+/, ""));
    url.searchParams.set("otp", otp);
    const data = await this.call(url, "GET");
    // Reject 'already verified' responses: they are not fresh proof of the submitted code.
    return data.type === "success" && typeof data.message === "string"
      && data.message.trim().toLowerCase() === "otp verified success";
  }
}
