import { resolveHidiMediaUrl } from "../network/config";

export type CartLine = {
  id: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  product: {
    id: string;
    slug: string;
    name: string;
    image?: string | null;
  };
  variant: {
    id: string;
    sku?: string;
    size: string;
    color: string;
    available: number;
  };
};

export type ApiCart = {
  id: string | null;
  sessionId: string;
  currency: "INR" | string;
  items: CartLine[];
  itemCount: number;
  subtotalPaise: number;
};

export type CartAttention = {
  lineId: string;
  productName: string;
  kind: "price" | "stock" | "unavailable";
  message: string;
  beforePaise?: number;
  afterPaise?: number;
};

export type SavedForLaterItem = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  image?: string | null;
  variantId: string;
  size: string;
  color: string;
  quantity: number;
  savedPricePaise: number;
  savedAt: number;
};

export function cartLineImage(line: CartLine) {
  return resolveHidiMediaUrl(line.product.image);
}

export function compareCartSnapshots(previous: ApiCart | null, current: ApiCart): CartAttention[] {
  const before = new Map((previous?.items ?? []).map((line) => [line.id, line]));
  const changes: CartAttention[] = [];

  for (const line of current.items) {
    const old = before.get(line.id);
    if (!old) continue;

    if (old && old.unitPricePaise !== line.unitPricePaise) {
      changes.push({
        lineId: line.id,
        productName: line.product.name,
        kind: "price",
        message: line.product.name + " changed price.",
        beforePaise: old.unitPricePaise,
        afterPaise: line.unitPricePaise,
      });
    }

    if (line.variant.available <= 0) {
      changes.push({
        lineId: line.id,
        productName: line.product.name,
        kind: "unavailable",
        message: line.product.name + " / " + line.variant.size + " is no longer available.",
      });
    } else if (line.variant.available < line.quantity) {
      changes.push({
        lineId: line.id,
        productName: line.product.name,
        kind: "stock",
        message: "Only " + line.variant.available + " of " + line.product.name + " / " + line.variant.size + " remain.",
      });
    }
  }

  return changes;
}
