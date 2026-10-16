import type { ApiVariant } from "./api";

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const SIZE_ALIASES: Record<string, string> = { "2XL": "XXL", "XXXL": "3XL", "XXXXL": "4XL" };

export function compareSizes(a: string, b: string): number {
  const normalize = (value: string) => {
    const upper = value.trim().toUpperCase();
    return SIZE_ALIASES[upper] ?? upper;
  };
  const ai = SIZE_ORDER.indexOf(normalize(a));
  const bi = SIZE_ORDER.indexOf(normalize(b));
  if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  return a.localeCompare(b, "en", { numeric: true });
}

export function variantsForColour(variants: ApiVariant[], colour: string): ApiVariant[] {
  return variants.filter((variant) => variant.color === colour)
    .sort((a, b) => compareSizes(a.size, b.size));
}

/** Derive the displayed price from purchasable variants of the shown colour.
 * Never pair one variant's selling price with another variant's MRP. */
export function cardPrice(variants: ApiVariant[], selectedId: string, fallbackPaise: number) {
  const selected = variants.find((variant) => variant.id === selectedId);
  const available = variants.filter((variant) => variant.available > 0);
  const pool = available.length ? available : variants;
  const lowest = [...pool].sort((a, b) => a.pricePaise - b.pricePaise)[0];
  const variant = selected ?? lowest;
  const pricePaise = variant?.pricePaise ?? fallbackPaise;
  const from = !selected && pool.some((entry) => entry.pricePaise !== pricePaise);
  // Unselected ranges show only "From"; an MRP comparison appears after selection.
  const mrpPaise = !from && variant && variant.mrpPaise > pricePaise ? variant.mrpPaise : null;
  return { pricePaise, from, mrpPaise, savingPaise: mrpPaise ? mrpPaise - pricePaise : 0 };
}

export function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function validColourHex(value?: string | null): string | undefined {
  return value && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value) ? value : undefined;
}
