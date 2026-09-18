export function productUrl(slug: string) {
  if (typeof window === "undefined") return `/products/${encodeURIComponent(slug)}`;
  return `${window.location.origin}/products/${encodeURIComponent(slug)}`;
}

export function whatsappOrderUrl(input: {
  slug: string;
  name: string;
  priceText: string;
  color?: string;
  size?: string;
}) {
  const number = (process.env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const url = productUrl(input.slug);
  const lines = [
    "Hi HIDI, I'd like to order this product:",
    "",
    input.name,
    `Price: ${input.priceText}`,
    input.color ? `Colour: ${input.color}` : null,
    input.size ? `Size: ${input.size}` : "Size: Please help me choose",
    `Product: ${url}`,
    "",
    "Please confirm availability and help me place the order.",
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join("\n"));
  return number
    ? `https://wa.me/${number}?text=${text}`
    : `https://api.whatsapp.com/send?text=${text}`;
}

export async function shareProduct(input: {
  slug: string;
  name: string;
  text?: string;
}) {
  const url = productUrl(input.slug);
  const text = input.text ?? `Take a look at ${input.name} from HIDI.`;

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ title: input.name, text, url });
    return "shared" as const;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  }

  return "unsupported" as const;
}
