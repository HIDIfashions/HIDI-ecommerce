import { BadRequestException } from "@nestjs/common";

export const FREE_SHIPPING_THRESHOLD_PAISE = 149900;
export const STANDARD_SHIPPING_PAISE = 9900;
const MAX_PAISE = 2_147_483_647;

/** Merchandise subtotal before rewards. Rewards are tender, not a price discount. */
export function shippingQuote(subtotalPaise: number) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0 || subtotalPaise > MAX_PAISE) {
    throw new BadRequestException("Invalid order total");
  }
  const shippingPaise = subtotalPaise > 0 && subtotalPaise < FREE_SHIPPING_THRESHOLD_PAISE ? STANDARD_SHIPPING_PAISE : 0;
  const totalPaise = subtotalPaise + shippingPaise;
  if (totalPaise > MAX_PAISE) throw new BadRequestException("Invalid order total");
  return { shippingPaise, totalPaise };
}
