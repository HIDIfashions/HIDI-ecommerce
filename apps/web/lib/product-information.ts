export type ProductInformation = {
  productType: string;
  fitDetail: string;
  edit: string;
};

export const COMMON_PRODUCT_DISCLAIMER = [
  "Product colour may vary slightly due to photographic lighting, device display settings and screen calibration.",
  "Minor variations in weave, texture or embroidery may occur and are part of the character of the garment.",
];

const PRODUCT_INFORMATION: Record<string, ProductInformation> = {
  "aara-sage-work-kurta": {
    productType: "Straight Kurta",
    fitDetail: "Straight fit with minimal thread detailing",
    edit: "Work Wear",
  },
  "sana-sand-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Relaxed straight fit with minimal tonal detailing",
    edit: "Casual Wear",
  },
  "mahira-indigo-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Straight tailored fit with subtle neckline detailing",
    edit: "Work Wear",
  },
  "ira-beige-office-kurta-set": {
    productType: "Office Kurta Set",
    fitDetail: "Straight fit with minimal surface detailing",
    edit: "Work Wear",
  },
  "nivya-olive-work-kurta": {
    productType: "Work Kurta",
    fitDetail: "Straight fit with fine tonal embroidery",
    edit: "Work Wear",
  },
  "tara-dusty-rose-straight-kurta": {
    productType: "Straight Kurta",
    fitDetail: "Straight fit with minimal neckline detail",
    edit: "Work Wear",
  },
  "diya-blue-everyday-kurta": {
    productType: "Casual Wear Kurta",
    fitDetail: "Relaxed straight fit with minimal detailing",
    edit: "Casual Wear",
  },
  "myra-peach-comfort-kurta-set": {
    productType: "Comfort Kurta Set",
    fitDetail: "Relaxed fit with fine tonal detailing",
    edit: "Casual Wear",
  },
  "rhea-mint-daily-kurta": {
    productType: "Daily Kurta",
    fitDetail: "Straight fit with minimal embroidery",
    edit: "Casual Wear",
  },
  "anika-ivory-embroidered-set": {
    productType: "Embroidered Set",
    fitDetail: "Straight coordinated fit with thread embroidery",
    edit: "Occasion",
  },
  "kiara-wine-festive-kurta-set": {
    productType: "Festive Kurta Set",
    fitDetail: "Straight fit with embroidery and subtle accents",
    edit: "Occasion",
  },
  "meher-gold-beige-occasion-set": {
    productType: "Occasion Set",
    fitDetail: "Structured straight fit with fine embroidery and subtle festive detailing",
    edit: "Occasion",
  },
};

export function getProductInformation(slug: string): ProductInformation | null {
  return PRODUCT_INFORMATION[slug] ?? null;
}
