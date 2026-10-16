/** Published facts only. This module does not calculate or authorize checkout. */
export const SHIPPING_THRESHOLD_PAISE = 0;
export const RETURN_WINDOW_DAYS = 7;
export const SHIPPING_COPY = "Shipping is ₹0.00 on every order.";
export const RETURN_COPY = "Eligible items may be returned within 7 days of delivery.";
export const EXCHANGE_COPY = "Exchange availability, charges and replacement stock must be confirmed before purchase.";
export const SHIPPING_TIMELINE = "Check your PIN on the product page for delivery availability and any arrival estimate supplied by the courier. Estimates may change; follow your order for tracking updates.";
export const REFUND_TIMELINE = "Refund processing times and any preference-return charges are awaiting confirmation.";
export const LAUNCH_OFFER_COPY = "The ₹1 privilege and alternative 15% offer are not combined.";
/** Missing operating facts remain explicit launch blockers, never invented defaults. */
export const LAUNCH_CONTENT_GAPS = [
  "Approved public support contact and operating hours",
  "Dispatch lead time and courier delivery ranges",
  "Exchange eligibility, pickup charges and replacement process",
  "Refund destinations and processing times",
  "Promotional SKU eligibility, silver allocation and final offer conditions",
] as const;
