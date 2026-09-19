export const PRODUCT_VARIANT_EVENT = "hidi-product-variant-selected";

export type ProductVariantSelection = {
  slug: string;
  variantId: string;
  color: string;
  size?: string;
};

export function publishProductSelection(selection: ProductVariantSelection) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRODUCT_VARIANT_EVENT, { detail: selection }));
  }
}

export function productUrl(slug: string) {
  const path = `/products/${encodeURIComponent(slug)}`;
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

// Accept a complete international number, never a generic WhatsApp share URL.
export function normalizeWhatsAppNumber(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  if (!/^\+?[\d\s()-]+$/.test(candidate)) return null;
  const digits = candidate.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function configuredWhatsAppNumber() {
  return normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER);
}

export function clampOrderQuantity(quantity: number, available: number) {
  const stock = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  if (stock === 0) return 0;
  const requested = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
  return Math.max(1, Math.min(requested, stock));
}

export function whatsappOrderUrl(input: {
  slug: string;
  name: string;
  priceText: string;
  color?: string;
  size?: string;
  quantity?: number;
  sku?: string;
}, phoneNumber: string | undefined = process.env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER) {
  const number = normalizeWhatsAppNumber(phoneNumber);
  if (!number) return null;
  const lines = [
    "HIDI_ORDER_REQUEST",
    "Hi HIDI, I'd like help ordering this product:",
    "",
    input.name,
    input.sku ? `SKU: ${input.sku}` : null,
    `Unit price shown: ${input.priceText}`,
    input.color ? `Colour: ${input.color}` : null,
    input.size ? `Size: ${input.size}` : "Size: Please help me choose",
    `Quantity: ${clampOrderQuantity(input.quantity ?? 1, Number.MAX_SAFE_INTEGER)}`,
    `Product: ${productUrl(input.slug)}`,
    "",
    "Please help me complete my order.",
  ].filter((line) => line !== null);

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${number}?text=${text}`;
}

export async function shareProduct(input: {
  slug: string;
  name: string;
  text?: string;
}) {
  const url = productUrl(input.slug);
  const text = input.text ?? `Take a look at ${input.name} from HIDI.`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: input.name, text, url });
      return "shared" as const;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled" as const;
      // A browser may expose sharing but not support it in the current context.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  }

  return "unsupported" as const;
}
