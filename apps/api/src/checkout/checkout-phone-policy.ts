import { BadRequestException } from "@nestjs/common";

export const OTP_TTL_MS = 5 * 60_000;
export const GRANT_TTL_MS = 15 * 60_000;
export const RESEND_DELAY_MS = 60_000;
export const MAX_OTP_ATTEMPTS = 5;

/** One canonical phone on contact, verification and delivery address. Never strip letters server-side. */
export function checkoutPhone(value: unknown): string {
  if (typeof value !== "string" || !/^(?:\+?91)?[6-9][0-9]{9}$/.test(value.trim())) {
    throw new BadRequestException("Enter a valid 10-digit Indian mobile number");
  }
  return `+91${value.trim().slice(-10)}`;
}

export function checkoutSession(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new BadRequestException("A valid checkout session is required");
  }
  return value;
}
