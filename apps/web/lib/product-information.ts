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
    edit: "Chill Vibes",
  },
  "sana-sand-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Relaxed straight fit with minimal tonal detailing",
    edit: "Daily Dose",
  },
  "mahira-indigo-kurta-set": {
    productType: "Kurta Set",
    fitDetail: "Straight tailored fit with subtle neckline detailing",
    edit: "Chill Vibes",
  },
  "ira-beige-office-kurta-set": {
    productType: "Office Kurta Set",
    fitDetail: "Straight fit with minimal surface detailing",
    edit: "Chill Vibes",
  },
  "nivya-olive-work-kurta": {
    productType: "Work Kurta",
    fitDetail: "Straight fit with fine tonal embroidery",
    edit: "Chill Vibes",
  },
  "tara-dusty-rose-straight-kurta": {
    productType: "Straight Kurta",
    fitDetail: "Straight fit with minimal neckline detail",
    edit: "Chill Vibes",
  },
  "diya-blue-everyday-kurta": {
    productType: "Casual Wear Kurta",
    fitDetail: "Relaxed straight fit with minimal detailing",
    edit: "Daily Dose",
  },
  "myra-peach-comfort-kurta-set": {
    productType: "Comfort Kurta Set",
    fitDetail: "Relaxed fit with fine tonal detailing",
    edit: "Daily Dose",
  },
  "rhea-mint-daily-kurta": {
    productType: "Daily Kurta",
    fitDetail: "Straight fit with minimal embroidery",
    edit: "Daily Dose",
  },
  "anika-ivory-embroidered-set": {
    productType: "Embroidered Set",
    fitDetail: "Straight coordinated fit with thread embroidery",
    edit: "Pretty Little Plans",
  },
  "kiara-wine-festive-kurta-set": {
    productType: "Festive Kurta Set",
    fitDetail: "Straight fit with embroidery and subtle accents",
    edit: "Pretty Little Plans",
  },
  "meher-gold-beige-occasion-set": {
    productType: "Occasion Set",
    fitDetail: "Structured straight fit with fine embroidery and subtle festive detailing",
    edit: "Pretty Little Plans",
  },
};

export function getProductInformation(slug: string): ProductInformation | null {
  return PRODUCT_INFORMATION[slug] ?? null;
}
