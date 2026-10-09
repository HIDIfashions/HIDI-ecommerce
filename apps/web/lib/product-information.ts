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
    edit: "Workwear Edit / New Arrivals",
  },
  "sana-sand-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Relaxed straight fit with minimal tonal detailing",
    edit: "Everyday / New Arrivals",
  },
  "mahira-indigo-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Straight tailored fit with subtle neckline detailing",
    edit: "Workwear Edit / New Arrivals",
  },
  "ira-beige-office-kurta-set": {
    productType: "Office Kurta Set",
    fitDetail: "Straight fit with minimal surface detailing",
    edit: "Workwear Edit",
  },
  "nivya-olive-work-kurta": {
    productType: "Work Kurta",
    fitDetail: "Straight fit with fine tonal embroidery",
    edit: "Workwear Edit",
  },
  "tara-dusty-rose-straight-kurta": {
    productType: "Straight Kurta",
    fitDetail: "Straight fit with minimal neckline detail",
    edit: "Workwear Edit",
  },
  "diya-blue-everyday-kurta": {
    productType: "Everyday Kurta",
    fitDetail: "Relaxed straight fit with minimal detailing",
    edit: "Everyday",
  },
  "myra-peach-comfort-kurta-set": {
    productType: "Comfort Kurta Set",
    fitDetail: "Relaxed fit with fine tonal detailing",
    edit: "Everyday",
  },
  "rhea-mint-daily-kurta": {
    productType: "Daily Kurta",
    fitDetail: "Straight fit with minimal embroidery",
    edit: "Everyday",
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
