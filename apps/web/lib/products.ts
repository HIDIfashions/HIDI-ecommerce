export type Product = {
  slug: string;
  name: string;
  subtitle: string;
  price: number;
  compareAt?: number;
  badge?: string;
  tone: string;
  sizes: string[];
  description: string;
};

export const products: Product[] = [
  {
    slug: "mahira-indigo-kurta-set",
    name: "Mahira Indigo Kurta Set",
    subtitle: "Cotton · 3 piece",
    price: 1890,
    badge: "New",
    tone: "indigo",
    sizes: ["M", "L", "XL", "XXL"],
    description: "An easy, polished kurta set with clean lines and a fluid silhouette for desk-to-dinner days."
  },
  {
    slug: "aara-sage-work-kurta",
    name: "Aara Sage Work Kurta",
    subtitle: "Cotton blend",
    price: 1290,
    tone: "sage",
    sizes: ["M", "L", "XL", "XXL"],
    description: "A quietly tailored everyday kurta designed to sit beautifully through long workdays."
  },
  {
    slug: "meher-wine-coord",
    name: "Meher Wine Co-ord",
    subtitle: "Viscose blend · 2 piece",
    price: 1690,
    badge: "Bestseller",
    tone: "wine",
    sizes: ["M", "L", "XL", "XXL"],
    description: "Rich wine tones, a long clean line and an effortless matching bottom for a refined weekday look."
  },
  {
    slug: "sana-sand-kurta-set",
    name: "Sana Sand Kurta Set",
    subtitle: "Cotton slub · 2 piece",
    price: 1490,
    tone: "sand",
    sizes: ["M", "L", "XL", "XXL"],
    description: "Soft neutral dressing with restrained detail, designed for repeat wear across seasons."
  }
];

export const formatINR = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(value);
