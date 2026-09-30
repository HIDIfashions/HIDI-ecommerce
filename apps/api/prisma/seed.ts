import "dotenv/config";
import { PrismaService } from "../src/prisma/prisma.service.js";


if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Demo seeding is disabled. Set ALLOW_DEMO_SEED only for an empty development database.");
const prisma = new PrismaService();

const sizes = ["M", "L", "XL", "XXL"] as const;

const products = [
  {
    name: "Aara Sage Work Kurta",
    slug: "aara-sage-work-kurta",
    color: "Sage",
    colorHex: "#87917C",
    pricePaise: 129000,
    collections: ["new-arrivals", "work-edit"],
    shortDescription: "Quiet sophistication for everyday workwear.",
    description: "A clean straight-cut kurta designed for office days and effortless everyday dressing. The muted sage tone, minimal detailing and comfortable silhouette make Aara easy to repeat throughout the week. Straight fit with minimal thread detailing.",
    fabric: "Cotton blend",
    care: "Gentle machine wash or hand wash",
  },
  {
    name: "Sana Sand Kurta Set",
    slug: "sana-sand-kurta-set",
    color: "Sand",
    colorHex: "#C7AD8D",
    pricePaise: 149000,
    collections: ["new-arrivals", "everyday"],
    shortDescription: "Soft neutrals made for unhurried everyday style.",
    description: "Sana pairs a calm sand palette with a relaxed coordinated silhouette. Designed around comfort and versatility, it moves easily from daily errands to casual workdays and relaxed evenings. Relaxed straight fit with minimal tonal detailing.",
    fabric: "Cotton-viscose blend",
    care: "Gentle wash separately",
  },
  {
    name: "Mahira Indigo Kurta Set",
    slug: "mahira-indigo-kurta-set",
    color: "Indigo",
    colorHex: "#34445E",
    pricePaise: 189000,
    collections: ["new-arrivals", "work-edit"],
    shortDescription: "Polished indigo for confident workday dressing.",
    description: "A refined coordinated kurta set in a rich indigo tone, designed to feel structured without becoming formal. Mahira brings colour to the HIDI Work Edit while remaining understated and highly wearable. Straight tailored fit with subtle neckline detailing.",
    fabric: "Cotton blend",
    care: "Cold wash separately",
  },
  {
    name: "Ira Beige Office Kurta Set",
    slug: "ira-beige-office-kurta-set",
    color: "Beige",
    colorHex: "#CDBDAA",
    pricePaise: 169000,
    collections: ["work-edit"],
    shortDescription: "A composed neutral for long working days.",
    description: "Ira is an understated beige set built around clean proportions and soft comfort. Its neutral colour gives it an elevated, professional character while remaining easy enough for regular office wear. Straight fit with minimal surface detailing.",
    fabric: "Cotton-linen blend",
    care: "Gentle machine wash",
  },
  {
    name: "Nivya Olive Work Kurta",
    slug: "nivya-olive-work-kurta",
    color: "Olive",
    colorHex: "#7A8066",
    pricePaise: 135000,
    collections: ["work-edit"],
    shortDescription: "Earthy, refined and made for repeat wear.",
    description: "Nivya combines a muted olive colour with an uncluttered silhouette for a sophisticated everyday workwear piece. Pair it with neutral trousers or coordinated bottoms for an effortless office look. Straight fit with fine tonal embroidery.",
    fabric: "Cotton blend",
    care: "Hand wash or gentle machine wash",
  },
  {
    name: "Tara Dusty Rose Straight Kurta",
    slug: "tara-dusty-rose-straight-kurta",
    color: "Dusty Rose",
    colorHex: "#B98D8D",
    pricePaise: 142000,
    collections: ["work-edit"],
    shortDescription: "A softer colour story for everyday confidence.",
    description: "Tara brings a subtle dusty-rose tone into the work wardrobe without becoming overly decorative. Its clean straight silhouette balances femininity with the restrained design language of HIDI. Straight fit with minimal neckline detail.",
    fabric: "Cotton-viscose blend",
    care: "Gentle wash",
  },
  {
    name: "Diya Blue Everyday Kurta",
    slug: "diya-blue-everyday-kurta",
    color: "Powder Blue",
    colorHex: "#AABFD1",
    pricePaise: 119000,
    collections: ["everyday"],
    shortDescription: "Easy colour. Easy silhouette. Everyday HIDI.",
    description: "Diya is designed for uncomplicated days when comfort comes first. The powder-blue tone and simple construction make it an easy wardrobe piece for home, errands, travel and casual outings. Relaxed straight fit with minimal detailing.",
    fabric: "Breathable cotton blend",
    care: "Machine wash on gentle cycle",
  },
  {
    name: "Myra Peach Comfort Kurta Set",
    slug: "myra-peach-comfort-kurta-set",
    color: "Peach",
    colorHex: "#E2B7A3",
    pricePaise: 159000,
    collections: ["everyday"],
    shortDescription: "Soft colour and all-day comfort in one coordinated look.",
    description: "Myra is a relaxed peach-toned kurta set created for easy daily styling. Its calm palette and fluid silhouette keep the look polished without compromising comfort. Relaxed fit with fine tonal detailing.",
    fabric: "Cotton-viscose blend",
    care: "Gentle wash",
  },
  {
    name: "Rhea Mint Daily Kurta",
    slug: "rhea-mint-daily-kurta",
    color: "Mint",
    colorHex: "#B8CDBD",
    pricePaise: 126000,
    collections: ["everyday"],
    shortDescription: "A fresh everyday essential in muted mint.",
    description: "Rhea brings a quiet freshness to the everyday wardrobe. Designed with clean lines and a soft mint palette, it works equally well for casual office days, family time and everyday errands. Straight fit with minimal embroidery.",
    fabric: "Cotton blend",
    care: "Gentle machine wash",
  },
  {
    name: "Anika Ivory Embroidered Set",
    slug: "anika-ivory-embroidered-set",
    color: "Ivory",
    colorHex: "#EEE8DA",
    pricePaise: 229000,
    collections: ["occasion"],
    shortDescription: "Understated occasion wear with delicate detail.",
    description: "Anika combines an ivory base with refined embroidery for occasions that call for elegance without excess. Designed to feel graceful, timeless and comfortable enough for extended celebrations. Straight coordinated fit with thread embroidery.",
    fabric: "Premium cotton-silk blend",
    care: "Dry clean recommended",
  },
  {
    name: "Kiara Wine Festive Kurta Set",
    slug: "kiara-wine-festive-kurta-set",
    color: "Wine",
    colorHex: "#6B2430",
    pricePaise: 249000,
    collections: ["occasion"],
    shortDescription: "Deep colour and restrained festive elegance.",
    description: "Kiara uses a rich wine palette and considered detailing to create a sophisticated festive look. Designed for dinners, celebrations and intimate functions where presence matters more than extravagance. Straight fit with embroidery and subtle accents.",
    fabric: "Viscose-silk blend",
    care: "Dry clean recommended",
  },
  {
    name: "Meher Gold Beige Occasion Set",
    slug: "meher-gold-beige-occasion-set",
    color: "Gold Beige",
    colorHex: "#C5A97A",
    pricePaise: 269000,
    collections: ["occasion"],
    shortDescription: "Quiet luxury for your most considered occasions.",
    description: "Meher represents the elevated side of HIDI: a sophisticated gold-beige palette, elegant detailing and an occasion-ready coordinated silhouette without excessive embellishment. Structured straight fit with fine embroidery and subtle festive detailing.",
    fabric: "Premium viscose-silk blend",
    care: "Dry clean only",
  },
] as const;

const collectionDefs = [
  ["New Arrivals", "new-arrivals", "Fresh HIDI pieces, added in small considered edits."],
  ["Work Edit", "work-edit", "Polished Indian wear for meetings, commutes and everything after."],
  ["Everyday", "everyday", "Easy silhouettes designed for repeat wear."],
  ["Occasion", "occasion", "Elevated colour and detail, without the noise."],
] as const;

function skuPart(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const category = await prisma.category.upsert({
    where: { slug: "ethnic-wear" },
    update: {
      name: "Ethnic Wear",
      description: "Contemporary Indian womenswear designed around work, everyday life and occasions.",
      active: true,
      position: 1,
    },
    create: {
      name: "Ethnic Wear",
      slug: "ethnic-wear",
      description: "Contemporary Indian womenswear designed around work, everyday life and occasions.",
      position: 1,
    },
  });

  const collectionMap = new Map<string, string>();
  for (let i = 0; i < collectionDefs.length; i++) {
    const [name, slug, description] = collectionDefs[i];
    const collection = await prisma.collection.upsert({
      where: { slug },
      update: { name, description, active: true, position: i + 1 },
      create: { name, slug, description, active: true, position: i + 1 },
    });
    collectionMap.set(slug, collection.id);
  }

  const catalogueSlugs = products.map((product) => product.slug);

  // Keep historical/test records for referential integrity, but hide legacy demo products.
  await prisma.product.updateMany({
    where: { slug: { notIn: catalogueSlugs }, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });

  for (let index = 0; index < products.length; index++) {
    const item = products[index];

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        categoryId: category.id,
        shortDescription: item.shortDescription,
        description: item.description,
        fabric: item.fabric,
        care: item.care,
        status: "ACTIVE",
        featuredRank: index + 1,
        seoTitle: `${item.name} | HIDI`,
        seoDescription: item.shortDescription,
      },
      create: {
        name: item.name,
        slug: item.slug,
        categoryId: category.id,
        shortDescription: item.shortDescription,
        description: item.description,
        fabric: item.fabric,
        care: item.care,
        status: "ACTIVE",
        featuredRank: index + 1,
        seoTitle: `${item.name} | HIDI`,
        seoDescription: item.shortDescription,
      },
    });

    // Make repeated seeding deterministic: catalogue membership and image ordering are replaced.
    await prisma.productCollection.deleteMany({ where: { productId: product.id } });
    for (let position = 0; position < item.collections.length; position++) {
      const collectionSlug = item.collections[position];
      const collectionId = collectionMap.get(collectionSlug);
      if (!collectionId) throw new Error(`Unknown collection: ${collectionSlug}`);
      await prisma.productCollection.create({
        data: { productId: product.id, collectionId, position: position + 1 },
      });
    }

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: [
        {
          productId: product.id,
          url: `/products/${item.slug}/01-main.png`,
          alt: `${item.name} front view`,
          position: 1,
        },
        {
          productId: product.id,
          url: `/products/${item.slug}/02-alt.png`,
          alt: `${item.name} alternate view`,
          position: 2,
        },
        {
          productId: product.id,
          url: `/products/${item.slug}/03-detail.png`,
          alt: `${item.name} fabric and detail view`,
          position: 3,
        },
      ],
    });

    for (const size of sizes) {
      const sku = `HIDI-${skuPart(item.slug)}-${skuPart(item.color)}-${size}`;
      const variant = await prisma.productVariant.upsert({
        where: {
          productId_size_color: {
            productId: product.id,
            size,
            color: item.color,
          },
        },
        update: {
          sku,
          colorHex: item.colorHex,
          mrpPaise: item.pricePaise,
          pricePaise: item.pricePaise,
          active: true,
          weightGrams: 550,
        },
        create: {
          productId: product.id,
          sku,
          size,
          color: item.color,
          colorHex: item.colorHex,
          mrpPaise: item.pricePaise,
          pricePaise: item.pricePaise,
          active: true,
          weightGrams: 550,
        },
      });

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: { reorderLevel: 5 },
        create: { variantId: variant.id, onHand: 10, reserved: 0, safetyStock: 0, reorderLevel: 5 },
      });
    }
  }

  console.log(`Seeded ${products.length} HIDI products, ${products.length * sizes.length} variants and ${products.length * sizes.length * 10} units of test stock.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

